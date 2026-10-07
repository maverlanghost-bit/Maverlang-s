# Seguridad — RLS (M47)

Cómo se garantiza que con la clave pública y la sesión de un usuario sólo se
ven y cambian sus propios datos, y que las tablas internas sólo las toca el
servidor (`service_role`).

## Matriz esperada

| Tabla | anon | A sobre datos de B | A sobre lo suyo |
|---|---|---|---|
| `profiles` | nada | no ve ni edita | lee y edita columnas no sensibles; no inserta ni borra; sensibles (`kyc_status`, `role`, `is_admin`, `country_blocked`) bloqueadas por trigger 0009 |
| `consents` | nada | nada | lee e inserta; nunca edita ni borra |
| `preferences` | nada | nada | lee, inserta y edita; nunca borra |
| `demo_accounts` | nada | nada | sólo lectura; sin escritura |
| `demo_positions` | nada | nada | sólo lectura; sin escritura |
| `demo_orders` | nada | nada | sólo lectura; sin escritura |
| `assets` | lectura | n/a (público) | todos leen; nadie escribe desde el navegador |
| `user_favorites` | nada | no ve, no inserta con su `user_id`, no borra | lee, inserta y borra; sin UPDATE |
| `waitlist` | nada | n/a | nadie (ni lectura ni escritura directa; sólo el servidor) |
| `_migration_flags` | nada | n/a | nadie (ni lectura ni escritura directa; sólo el servidor) |

Funciones `demo_trade` y `demo_reset`: anon y `authenticated` siempre
denegados (sólo `service_role`), incluso con el `user_id` propio.

## Cómo correr la auditoría

```bash
npm run audit:rls -- --dry-run   # imprime la matriz, sin conectarse
npm run audit:rls                # contra desarrollo, con 0005 a 0009 aplicadas
```

El script crea 2 usuarios temporales (`rls-a-…`/`rls-b-…@example.test`),
prueba SELECT/INSERT/UPDATE/DELETE y las rpc con el `user_id` de otro,
imprime OK/FALLA por celda y sale con 1 si hay alguna FALLA. Siempre borra
los usuarios al final (`finally`; sus filas caen en cascada).

Reporte de sólo lectura para el SQL Editor: `supabase/audits/rls-report.sql`
(tablas sin RLS, políticas por tabla, funciones `security definer` sin
`search_path`, grants de anon/authenticated). Endurecimiento idempotente:
`supabase/migrations/0009_rls_hardening.sql` (se pega después de 0008).

## Tablas futuras

Cada tarea que cree una tabla (`asset_safety`, `orders`, `wallets`,
depósitos y retiros) debe: activar RLS en su migración y agregar su fila a
`AUDIT_TABLES` y a la matriz de `scripts/audit-rls.mjs`. Si aparece una tabla
de `public` sin fila en la matriz, la auditoría FALLA.
