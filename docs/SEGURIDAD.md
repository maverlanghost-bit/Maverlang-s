# Seguridad — RLS (M47) + cabeceras y CSP (M48)

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

## Cabeceras y CSP (M48)

Todas las respuestas llevan: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` (más `frame-ancestors 'none'` en la CSP),
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
(cerrado; si el KYC de M76 necesita cámara, se abre ahí) y
`Cross-Origin-Opener-Policy: same-origin-allow-popups` (Privy y Google usan
popups). `Strict-Transport-Security` sólo en producción. Sin `X-Powered-By`
(`poweredByHeader: false`). Las páginas salen de `middleware.ts`; las rutas
API (`/api/*`, fuera del matcher) de `next.config.ts` + `jsonResult`.

La CSP usa nonce por solicitud (guía de Next 16): `script-src 'self'
'nonce-<n>' 'strict-dynamic'` (`'unsafe-eval'` sólo en dev),
`style-src 'self' 'unsafe-inline'`, `connect-src 'self'` + Supabase
(`*.supabase.co` + origen del proyecto desde env, https y wss), Privy
(`auth.privy.io`, `*.privy.io`, `*.privy.systems`, `*.rpc.privy.systems`) y el
RPC cliente (env o endpoint del cluster), `frame-src`/`child-src` Privy +
WalletConnect verify + Turnstile, `upgrade-insecure-requests` sólo en
producción. Jupiter, mindicador y el RPC privado son sólo servidor: no van en
la CSP. Vercel Analytics (M50) es mismo origen (`/_vercel/insights/*`):
cubierto por `'self'`; al agregarlo, verificar que respete el nonce.

**Efecto colateral:** el nonce exige render dinámico (`await connection()`
en el layout raíz): la portada pierde su ISR de 30 s. Volver a estático exige
CSP por hashes (SRI experimental) o por ruta, fuera de esta tarea.

**Si la demo publicada se rompe:** poner `CSP_MODE=report-only` en Vercel
(Settings → Environment Variables) y redeployar, sin tocar código. Modos:
`CSP_MODE=enforce|report-only|off` (default `report-only` en desarrollo,
`enforce` en producción); `CSP_REPORT_URI` opcional (M61 lo conecta a Sentry).
