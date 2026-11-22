# Migraciones a producción — runbook (Supabase)

Estado de partida (auditoría v3, 2026-11-21): de las migraciones tardías sólo
**0043 y 0044** están confirmadas como aplicadas en producción. Todo lo demás
de esta lista hay que tratarlo como **no aplicado** hasta verificarlo con el
SQL de cada paso. Ver `docs/AUDITORIA-HANDOFF.md` §4.1-4.2, §5 y §10.

Esta lista no sustituye la reconciliación de la cadena (DB-06/07): falta el
archivo `0021`, no existe `0052`, y `0025` no compila sobre una base vacía. Por
eso el ensayo en staging es obligatorio.

## 0. Antes de tocar nada

1. **Backup**: confirmar PITR activo y tomar un backup manual (Dashboard →
   Database → Backups). Anotar la hora (UTC) para poder restaurar.
2. **Staging primero**: restaurar el último backup de producción en un proyecto
   de staging (o usar una copia equivalente) y aplicar ahí TODA la lista, en
   orden, con las verificaciones. Sólo con staging verde se repite en
   producción.
3. **Ventana**: hacerlo con poco tráfico. 0058 reescribe FKs (toma locks cortos
   sobre las tablas financieras) y 0056/0057 crean políticas y triggers.
4. **Código y base van juntos**: 0056 hace que las RPC exijan MFA y 0058 agrega
   `request_my_deletion`/`anonymize_user`; desplegar el código que las usa
   después de aplicar las migraciones, no antes.
5. Cada archivo se pega **entero, una sola vez**, en el SQL Editor y se
   ejecuta como `postgres`. Si un paso falla, parar: no seguir con el
   siguiente.

## 1. Orden de aplicación

| # | Archivo | Qué hace | Depende de |
|---|---------|----------|------------|
| 1 | `0045_profiles_immutability.sql` | Cierra DB-A: `update_my_profile` no deja cambiar email/rut/país/etc. tras onboarding | 0043, 0044 |
| 2 | `0046_profiles_onboarding_declaration.sql` | `handle_new_user` ignora la metadata, declaración U.S. person, `compliance_config` | 0045 |
| 3 | `0047_trade_reservations_forward.sql` | Lleva `trade_reservations` al esquema de la 0042 nueva | 0042, 0031 |
| 4 | `0048_sponsor_usage.sql` | Cuotas durables del patrocinio | 0002 |
| 5 | `0049_trade_quote_store.sql` | Cotización en la reserva | 0047 |
| 6 | `0050_wallet_link_challenges.sql` | Desafíos de vinculación de billetera | 0041 |
| 7 | `0051_wallet_withdrawals.sql` | Libro de retiros | 0050 |
| 8 | `0053_copy_trading.sql` | Tablas de copy trading (versión publicada) | 0002 |
| 9 | `0054_ai_shared_chats.sql` | Chats compartidos | — |
| 10 | `0055_copy_follows_lockdown.sql` | Quita escritura del cliente en `copy_follows` (DB-H) | 0053 |
| 11 | `0056_mfa_restrictive.sql` | Políticas RESTRICTIVE de MFA + RPC con `mfa_requerido` (AUTH-1) | 0041, 0046 |
| 12 | `0057_user_write_caps.sql` | Topes por usuario y `add_my_consent` final (DB-C/G/K) | 0056 |
| 13 | `0058_account_deletion.sql` | Borrado por anonimización, FKs RESTRICT, `ai_shared_chats` con expiración | 0054, 0056 |
| 14 | `0059_integrity.sql` | Índices únicos de RUT y billetera primaria (DB-I) | 0029 |

Antes del paso 1, verificar si algo de lo anterior ya está (no asumir):

```sql
select to_regclass('public.trade_reservations') is not null as reservas,
       to_regclass('public.sponsor_usage') is not null as sponsor,
       to_regclass('public.wallet_withdrawals') is not null as retiros,
       to_regclass('public.copy_follows') is not null as copy,
       to_regclass('public.ai_shared_chats') is not null as chats,
       to_regclass('public.compliance_config') is not null as cfg;
```

Si una tabla ya existe, su migración probablemente corrió: igual es
idempotente, pero comparar con staging antes de reejecutarla. `0042` debe estar
en su versión nueva (índice `trade_reservations_one_active_idx`); si la base
corrió la 0042 vieja, el paso 3 (0047) es el que la actualiza.

## 2. Verificación después de cada paso

Correr en el SQL Editor; todos los resultados esperados están en la columna
"Esperado".

**Tras 0045 / 0046**

```sql
select pg_get_functiondef('public.update_my_profile(jsonb)'::regprocedure)
         like '%us_person_declaration%' as rpc_0046;          -- Esperado: true
select count(*) from public.compliance_config;                 -- Esperado: 1
select prosecdef, proconfig from pg_proc
 where oid = 'public.handle_new_user()'::regprocedure;         -- true, search_path
```

**Tras 0047-0051**

```sql
select indexname from pg_indexes
 where indexname in ('trade_reservations_one_active_idx',
                     'wallet_withdrawals_one_reserved_idx');   -- Esperado: 2 filas
select relname, relrowsecurity, relforcerowsecurity from pg_class
 where relname in ('sponsor_usage','wallet_withdrawals','wallet_link_challenges');
                                                               -- Esperado: RLS true
select has_table_privilege('authenticated','public.wallet_withdrawals','select,insert,update,delete');
                                                               -- Esperado: false
```

**Tras 0053-0055**

```sql
select policyname, cmd from pg_policies
 where tablename = 'copy_follows';                             -- Esperado: sólo *_select_own
select privilege_type from information_schema.role_table_grants
 where table_name = 'copy_follows' and grantee = 'authenticated';  -- Esperado: SELECT
select relname, relforcerowsecurity from pg_class
 where relname in ('copy_subscriptions','billing_events','copy_follows',
                   'copy_runs','copy_feed_snapshots');         -- Esperado: todas true
```

**Tras 0056**

```sql
-- 14 tablas (menos las que no existan en tu base)
select tablename, policyname, permissive from pg_policies
 where policyname like '%\_mfa\_restrictive' order by tablename;
                                                               -- Esperado: permissive = 'RESTRICTIVE'
select count(*) from pg_policies where policyname like '%\_mfa\_restrictive';
                                                               -- Esperado: 14
select proname, prosrc like '%mfa_requerido%' as con_mfa
  from pg_proc
 where oid in ('public.update_my_profile(jsonb)'::regprocedure,
               'public.add_my_consent(text,text)'::regprocedure);
                                                               -- Esperado: ambas true
select has_function_privilege('anon','public.update_my_profile(jsonb)','execute'),
       has_function_privilege('authenticated','public.update_my_profile(jsonb)','execute');
                                                               -- Esperado: false, true
```

Prueba funcional (con un usuario de prueba con TOTP): un JWT `aal1` debe
recibir `[]` en `GET /rest/v1/profiles` y `42501 mfa_requerido` en
`rpc/update_my_profile`; con `aal2` funciona normal.

**Tras 0057**

```sql
select tgname, tgrelid::regclass from pg_trigger
 where tgname in ('price_alerts_enforce_caps','user_favorites_enforce_caps',
                  'external_holdings_enforce_caps');           -- Esperado: 3 filas
select prosrc like '%tope_consentimientos%' as final_0057
  from pg_proc where oid = 'public.add_my_consent(text,text)'::regprocedure;
                                                               -- Esperado: true
select prosrc like '%mfa_requerido%' as conserva_mfa
  from pg_proc where oid = 'public.add_my_consent(text,text)'::regprocedure;
                                                               -- Esperado: true
```

**Tras 0058**

```sql
select conrelid::regclass as tabla, conname, confdeltype
  from pg_constraint
 where contype = 'f' and confdeltype = 'c'
   and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
   and conrelid::regclass::text in
       ('orders','wallet_movements','crypto_deposits','wallet_withdrawals',
        'trade_reservations','sponsor_usage','sponsor_usage_requests',
        'compliance_events','consents','wallets','copy_subscriptions','copy_runs');
                                                               -- Esperado: 0 filas
select has_function_privilege('authenticated','public.anonymize_user(uuid)','execute'),
       has_function_privilege('service_role','public.anonymize_user(uuid)','execute'),
       has_function_privilege('authenticated','public.request_my_deletion()','execute');
                                                               -- Esperado: false, true, true
select column_name from information_schema.columns
 where table_name = 'ai_shared_chats' and column_name in ('expires_at','revoked_at');
                                                               -- Esperado: 2 filas
select confdeltype from pg_constraint
 where conrelid = 'public.ai_shared_chats'::regclass and contype = 'f';
                                                               -- Esperado: 'c'
```

**Tras 0059** (revisar también los `WARNING` del editor)

```sql
select indexname from pg_indexes
 where indexname in ('wallets_one_primary_per_user_uidx','profiles_rut_unique_idx');
                                                               -- Esperado: 2 filas
```

Si 0059 emitió `WARNING ... duplicado(s)`, el índice **no** se creó. Listar y
resolver a mano, luego volver a pegar 0059:

```sql
select user_id, chain, count(*) from public.wallets
 where is_primary group by 1,2 having count(*) > 1;
select regexp_replace(upper(rut),'[^0-9K]','','g') as rut_norm, count(*)
  from public.profiles where rut is not null and onboarding_completed
 group by 1 having count(*) > 1;
```

## 3. Después de aplicar

- Volver a correr la auditoría de grants/RLS (`npm run audit:rls` si está
  disponible) y comparar con staging.
- Smoke: login con y sin TOTP, onboarding, guardar perfil, crear un aviso,
  agregar/quitar favorita, solicitar borrado de cuenta (en una cuenta de prueba).
- Anotar en `PROGRESO.md` qué se aplicó y la fecha.

## 4. Rollback

No hay rollback automático. Si algo sale mal: parar, no reintentar a ciegas y
restaurar desde el backup/PITR de la sección 0 (o arreglar hacia adelante con
una migración nueva). Cambios que se pueden revertir a mano sin restaurar:

- 0056: `drop policy <tabla>_mfa_restrictive on public.<tabla>;`
- 0057: `drop trigger <tabla>_enforce_caps on public.<tabla>;`
- 0059: `drop index public.profiles_rut_unique_idx;` y
  `drop index public.wallets_one_primary_per_user_uidx;`

## 5. Nunca volver a ejecutar

Estas migraciones recrean funciones, triggers o grants con versiones **más
débiles** que las posteriores. Si se pegan de nuevo después de la versión
nueva, deshacen el endurecimiento:

| Migración | Por qué no |
|-----------|-----------|
| `0002_supabase_auth.sql` | Recrea `handle_new_user` y grants de `profiles`/`consents` anteriores a 0043-0046 |
| `0005_registro_simple.sql` | `handle_new_user` antiguo: confía en la metadata del cliente |
| `0009_rls_hardening.sql` | Reabre grants de `profiles` (`update`) y `consents` (`insert`) |
| `0015_compliance.sql` | `handle_new_user` antiguo que calcula `onboarding_completed` desde la metadata |
| `0038_profiles_lockdown.sql` | Recrea el trigger sin el bypass `app.profile_write` y rompe el onboarding |
| `0043_profiles_rpc.sql` | Reemplaza `update_my_profile` por la versión débil (acepta email, permite desactivar onboarding) |
| `0045_profiles_immutability.sql` | Reemplaza la `update_my_profile` de 0046 |

Si por error se ejecutó alguna de las anteriores: volver a aplicar, en orden,
`0046` y luego `0056` y `0057` (y `0055` si fue 0053), y repetir las
verificaciones.

Tampoco editar migraciones ya publicadas (0053 fue editada in situ y esa es la
causa de 0055): todo cambio nuevo va en un archivo nuevo.

## 6. Pendientes conocidos (no cubiertos por 0055-0059)

- `reserve_trade_amount` (0042/0047) cuenta estados `signed`/`built` que el
  CHECK de `orders` no permite (DB-M): inocuo, se limpia en la próxima
  reescritura de la función.
- `anonymize_user` no borra ni desactiva el usuario de `auth.users`: el
  servidor debe bloquear el acceso (por ejemplo `ban_duration` en GoTrue) tras
  llamarla.
- Política de retención (cuánto tiempo se conserva el historial UAF) y revisión
  legal: pendientes fuera del repo.
- Checkpoints de dinero real: D-02, DB-03/06/07, KYC/AML y legal siguen siendo
  "NO GO" según el handoff.
