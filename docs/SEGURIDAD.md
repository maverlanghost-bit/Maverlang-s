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

## Dependencias (M58 — 2026-10-07)

Política: `npm run audit:deps` (`npm audit --omit=dev --audit-level=high`)
falla si hay altas. Dependabot semanal de npm, minor+patch agrupados, tope
de 5 PR (`.github/dependabot.yml`; rige cuando M87 suba el repo).
`engines: node >= 22` (PC en Node 24; el runtime 22/24 de Vercel lo
confirma M50).

`npm audit --omit=dev` (2026-10-07): 0 críticas y 4 altas en 2 avisos (el
resto son moderadas y no bloquean el script). No se actualizó nada: los
2 directos ya están en su última versión y el único fix que ofrece audit
es `--force` con breaking (prohibido por la tarea).

1. `bigint-buffer` — alta, desbordamiento en `toBigIntLE()`
   (GHSA-3gc7-fjrx-p6mg). Ruta: `@solana/spl-token@0.4.15` →
   `@solana/buffer-layout-utils` → `bigint-buffer@1.1.5`. Uso:
   `git grep toBigIntLE` vacío en nuestro código; sólo alcanzable dentro
   de spl-token al codificar instrucciones. Sin parche compatible (0.4.15
   es la última 0.4.x; el fix propuesto es bajar a spl-token 0.1.8).
   Decisión: se deja con esta justificación; reevaluar con un parche 0.4.x
   o con la migración futura (fuera de alcance: no migrar web3.js 1.x).
2. `ws` 8.x — alta (GHSA-58qx-3vcg-4xpx y GHSA-96hv-2xvq-fx4p). Ruta:
   `@privy-io/react-auth@3.47.0` → WalletConnect/viem → copias anidadas
   `ws@8.18.x` (el árbol ya trae `ws@8.22.0` en otras ramas: el parche
   existe arriba, pero las copias anidadas sólo las corrige un release
   upstream). Uso: nuestro código nunca importa `ws`; en navegador rige
   el WebSocket nativo y no hay servidor `ws` propio. Sin parche
   compatible (3.47.0 es la última 3.x; el fix propuesto es bajar a 3.6.1).
   Decisión: se deja con esta justificación; Dependabot avisará del fix.
3. Moderadas (informativas): `decode-uri-component`, `stream-json` (vía
   `jayson` de web3.js 1.x) y `uuid` (vía MetaMask/WalletConnect). Mismo
   criterio: sólo `--force` con breaking.

`npx depcheck` (2026-10-07): marcó `geist`, `tailwindcss` y
`@tailwindcss/postcss` — falsos positivos confirmados con `git grep`:
`geist` se usa en `app/fonts.ts` (fuentes locales) + `app/layout.tsx`;
`tailwindcss` en `app/globals.css` y `@tailwindcss/postcss` en
`postcss.config.mjs`. `@solana-program/memo` (sin import directo) lo exige
la resolución de `@privy-io/react-auth/solana` (ver PROGRESO). No se
desinstala nada; `server-only`, `@privy-io/react-auth` y `@solana/*`
intactos (M65+).

Restos: `t18-check.ts` no lo importa nadie y no está trackeado (fuera de
`git ls-files`, ya ignorado); queda en disco y su borrado físico lo hace
el operador. `.gitignore` ahora cubre `.next-*/`, `*.log`,
`*.tsbuildinfo` y `data/audit-cache/` (`.next-dev.log` y
`tsconfig.tsbuildinfo` no existen en disco).

## Límite de solicitudes (M49)

Las rutas sensibles devuelven 429 con `Retry-After` antes de tocar
proveedores externos: `/api/trade/*` (20/min por usuario y 60/min por IP;
la demo suma 30/min por usuario), `/api/demo/reset` (5/h por usuario),
`/api/me/*` y `/api/wallet/balances|activity` (60/min por usuario),
`/api/market/search` (60/min por IP), `/api/prices` (120/min por IP),
`/api/onramp/session` (como trade), `/api/onramp/webhook` (300/min por IP;
la firma se verifica aparte) y `/api/waitlist` (5/h por IP). Sin rutas
`/api/cron/*` hoy; su política (10/min) ya está definida en
`lib/security/rate-limit.ts`.

Backend: Upstash si hay `UPSTASH_REDIS_REST_URL` y
`UPSTASH_REDIS_REST_TOKEN` (global entre instancias de Vercel); si no,
memoria local (en producción avisa una vez: no frena a un bot distribuido).
`RATE_LIMIT_BACKEND=memory|upstash|auto` (default `auto`; el e2e lo fuerza a
`memory`). En desarrollo, `RATE_LIMIT_TEST_SEARCH=5` baja la búsqueda para
probar el 429 (en producción se ignora). Verificación:
`npm run check:upstash` (INCR + EXPIRE + GET + DEL de una clave de prueba,
sin imprimir valores; lo corre el operador).

## Límites de Supabase Auth (M49 — sólo documentado, no se toca el panel)

El registro y el ingreso van directo a Supabase desde el cliente; Supabase
ya limita su Auth. Valores recomendados para la demo (Supabase →
Authentication → Rate Limits): registros por IP 30 cada 5 min, ingresos por
IP 30 cada 5 min, verificaciones de token 30 cada 5 min, y correos según el
SMTP que se contrate (el integrado trae un límite bajo por hora; el SMTP
propio es M51).

Si aparecen registros falsos, activar CAPTCHA gratis con Cloudflare
Turnstile en el Auth de Supabase (queda documentado, no se implementa
ahora): (1) crear el sitio en Cloudflare (dash.cloudflare.com → Turnstile →
Add site, tipo Managed); (2) copiar Site Key y Secret Key; (3) en Supabase
(Authentication → Settings → Bot and CAPTCHA protection) pegar ambas y
guardar; (4) el formulario suma el widget y envía el token en el `signUp`.
Sin el widget activo, el paso (4) no se hace: hoy el registro no lleva
CAPTCHA.

## Secretos (M46)

Inventario (dónde se crean, quién los tiene, rotación cada 90 días y siempre
que se filtren; lectura sólo en servidor vía `lib/env.ts` y
`lib/supabase/secret.ts`; nunca en `NEXT_PUBLIC_*` ni en git):

| Secreto | Se crea en | Lo tienen |
|---|---|---|
| `SUPABASE_SECRET_KEY` (alias viejo `SERVICE_ROLE_KEY`) | Supabase → Project Settings → API Keys | servidor + scripts del operador |
| `PRIVY_APP_SECRET` | Privy → Settings → API Keys | servidor |
| `JUPITER_API_KEY` | portal.jup.ag | servidor |
| `KOYWE_SECRET` / `KOYWE_WEBHOOK_SECRET` | panel de Koywe | servidor |
| `CRON_SECRET` | `openssl rand -base64 32` (Vercel → Environment Variables) | operador + Vercel |
| `RESEND_API_KEY` (M51) / `SENTRY_AUTH_TOKEN` (M61) / `HELIUS_API_KEY` | sus paneles | servidor |

Verificación: `npm run scan:secrets` (árbol + bundle; `--history` lo corre
el operador, lento) sale 0 antes de cada deploy. El repo de GitHub (M50)
debe ser **privado**: el historial puede traer la clave vieja (ya rotada,
ya no sirve) y no se reescribe (sin `filter-repo` ni `push --force`).

Rotación (Supabase, Privy, Jupiter, Koywe, Resend): (1) crear la clave nueva
en el panel del proveedor; (2) ponerla en `.env.local` y en Vercel
(Settings → Environment Variables); (3) redeployar y probar; (4) borrar la
vieja en el panel. Nunca se pegan claves en chats ni en archivos del repo.

Si se filtra una clave: rotar primero, investigar después. Pasos: (1) rotar
como arriba (Supabase: crear secret nueva, actualizar envs, borrar la
vieja); (2) revisar logs de Supabase (Dashboard → Logs) buscando usos
raros; (3) correr `npm run scan:secrets -- --history` y anotar en
`PROGRESO.md` qué commit la trae ("clave rotada, el valor del historial ya
no sirve"); (4) si hubo accesos ajenos, avisar a Manu antes del deploy.

Dinero real apagado: mientras `REAL_TRADING_READY` no sea `true`, las rutas
de dinero real responden 503 `REAL_DISABLED` sin tocar servicios externos
(`/api/trade/*` sólo en el camino real; la demo sigue igual). Los scripts
con secret key imprimen su proyecto (sólo el ref) y, fuera de desarrollo,
exigen `--confirm-project <ref>`; nunca corren desde una ruta pública (el
sync en Vercel va por cron con `CRON_SECRET`, M50).
