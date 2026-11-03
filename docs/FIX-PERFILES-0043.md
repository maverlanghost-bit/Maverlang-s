# Fix C-01 — perfil y consentimientos por RPC (migración 0043)

## Contexto

La base viva confirmó el 2026-11-03:

- `update_tabla = 1`: `authenticated` conserva `UPDATE` de fila completa sobre `profiles`.
- `update_columnas = 17`.
- `trigger_0038 = 0`: `profiles_reject_client_locked_change` no existe.

Con eso, cualquier usuario autenticado podía hacer un `PATCH` directo a la API REST
de Supabase y escribir `onboarding_completed`, `rut`, `email`, `telefono`,
`fecha_nacimiento`, `residence_country`, `nationality_country` e `is_us_person`.
El gate (`lib/auth/registro-schema.ts:220-221`) confía en
`onboarding_completed = true`, así que un solo campo saltaba la aceptación de
términos y privacidad.

## Qué cambia

### `supabase/migrations/0043_profiles_rpc.sql`

1. `public.update_my_profile(p_patch jsonb)` — `security definer`, `search_path`
   fijo, `auth.uid()` obligatorio, lista blanca de campos, validación de país,
   edad, RUT, teléfono, idioma, moneda y bloqueo de países sancionados.
   `onboarding_completed = true` exige `consents` de `terminos` y `privacidad`.
   La fecha de la declaración la pone el servidor (`now()`), no el cliente.
2. `public.add_my_consent(p_doc, p_version)` — `security definer`, valida
   `terminos|privacidad|riesgos`, inserta como `auth.uid()` y es idempotente.
3. Lockdown: `authenticated` pierde `UPDATE` de tabla en `profiles` (queda
   `SELECT` + `UPDATE` solo de `nombre`, `language`, `display_currency`) y
   pierde `INSERT` en `consents` (queda `SELECT`).
4. Recrea el trigger de 0038 con bypass para la RPC vía
   `set_config('app.profile_write', 'on', true)`.

### `lib/services/users.rls.ts`

- `update()` llama `rpc("update_my_profile", { p_patch })` en vez de
  `from("profiles").update()`. Si la RPC no existe, falla cerrado con
  `PROFILE_MIGRATION_MESSAGE`; nunca vuelve al UPDATE directo.
- `addConsent()` llama `rpc("add_my_consent", ...)`.
- `throwDb()` mapea `22023`/`P0002` y distingue `42501` de RLS de un rechazo
  de cumplimiento.

### `lib/supabase/schema-error.ts`

- Reconoce `PGRST202` y `42883` (función inexistente) para que la falta de 0043
  sea un error claro y no un `UPSTREAM` genérico.

## Orden de despliegue (importante)

1. **Aplicar 0043 en Supabase** (SQL Editor). Es idempotente.
2. **Recién después** desplegar el código de esta rama. Si el código sale antes,
   el perfil responde `INTERNAL` con el mensaje de migración faltante (falla
   cerrado, no pierde datos).
3. **No aplicar 0038 después de 0043.** 0038 vuelve a crear el trigger sin el
   bypass de la RPC y rompe el onboarding. 0043 ya incluye el lockdown.
4. Verificar con la consulta de abajo.

## Verificación

```sql
select
  (select count(*) from information_schema.role_table_grants
     where table_schema='public' and table_name='profiles'
       and grantee='authenticated' and privilege_type='UPDATE') as update_tabla,
  (select count(*) from information_schema.role_column_grants
     where table_schema='public' and table_name='profiles'
       and grantee='authenticated' and privilege_type='UPDATE') as update_columnas,
  (select count(*) from pg_trigger
     where tgrelid='public.profiles'::regclass and not tgisinternal
       and tgname='profiles_reject_client_locked_change') as trigger_0038;
```

Esperado: `0, 3, 1`.

Prueba funcional:
- Registro/onboarding: guardar nombre, país, RUT, teléfono, fecha y declaración;
  debe seguir funcionando.
- Aceptar términos y privacidad; luego encender onboarding; debe funcionar.
- `PATCH /rest/v1/profiles?id=eq.<uid>` con `{"onboarding_completed": true}`
  usando el JWT del usuario: debe devolver `42501` (permission denied for column),
  no 200.
- Insert directo en `consents`: debe devolver `42501`.

## Rollback

Si hubiera que revertir el código antes de aplicar 0043, el perfil falla cerrado.
Si se aplicó 0043 y hay que volver atrás, **no** se debe re-abrir el UPDATE de
tabla: eso reabre C-01. El rollback correcto es revertir el código y mantener el
lockdown, o reemplazar las RPC por una versión corregida.

## Pruebas ejecutadas

- `npx tsc --noEmit` → 0.
- `npx eslint` sobre los 4 archivos → 0 errores, 0 warnings.
- `npx vitest run tests/unit/users-rls-rpc.test.ts tests/unit/profiles-rpc-migration.test.ts tests/unit/compliance-m75.test.ts`
  → 3 archivos, 28 tests, todos en verde.
