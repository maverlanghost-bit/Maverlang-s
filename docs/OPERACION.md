# Operación y monitoreo de disponibilidad (M62)

Cómo saber en menos de 5 minutos si la app, Supabase, Jupiter, xStocks, el RPC de Solana, el dólar (mindicador) o Koywe dejaron de responder, y qué hacer en cada caso.

## Endpoints de salud

### `GET /api/health` (superficial)

- **Qué hace:** nada de red. Responde `{ ok: true, version: <sha corto>, env }`.
- **Para qué:** monitores de disponibilidad (uptime) cada 1 minuto, desde 2 regiones.
- **Cabeceras:** `Cache-Control: no-store`.
- **Estado:** siempre `200` mientras el proceso sirva solicitudes. Si no responde, la instancia o el deploy están caídos.
- `version` es el sha corto (7 caracteres) del commit del deploy (`VERCEL_GIT_COMMIT_SHA`); en local sin esa variable es `null`.

### `GET /api/health/deep` (dependencias)

- **Autenticación:** `Authorization: Bearer <CRON_SECRET>` (el mismo secreto de los crons internos, M46). Sin token, con token incorrecto o sin `CRON_SECRET` configurado → **401**.
- **Qué hace:** corre en paralelo un chequeo por dependencia, cada uno con timeout de 3 s:

| Chequeo | Sonda | Crítico |
|---|---|---|
| `supabase` | `select symbol from assets limit 1` con la clave de servidor | Sí |
| `jupiter` | Price API v3 de USDC + AAPLx | Sí |
| `xstocks` | `GET /public/assets/AAPLx` | No |
| `fx` | `FX_SOURCE_URL` (mindicador): `serie[0].valor` > 0 | No |
| `rpc` | `getSlot` en el RPC de Solana | No |
| `koywe` | Auth (aún `skipped`: el endpoint real llega con M80) | No |

- **Respuesta:** `{ ok, env, dataMode, uptimeSeconds, memory: { usedMb, totalMb }, checks: { <nombre>: { ok, ms, error? } } }`.
- **Estados:** `200` si los críticos (Supabase, Jupiter) están OK; **`503` si alguno falla**. Los chequeos no configurados salen `status: "skipped"` y no tiran la salud.
- **Modo mock / local / CI (`DATA_MODE=mock` sin credenciales):** todos los chequeos quedan `skipped` y la respuesta es `200` determinista. Así los monitores y tests funcionan igual en mock y en real, sin red.
- **Errores:** cortos y redactados (p. ej. `supabase 503`, `http 429`, `Tiempo de espera agotado.`). Nunca URLs con claves ni stack traces.

### Exenciones

- `/api/health*` **no pasa por el middleware** (el matcher excluye `/api`), por lo tanto no sufre geobloqueo ni genera sesiones.
- Ninguna de las dos rutas usa `withRateLimit`: los monitores pueden consultar cada 1 min desde cualquier región sin caer en 429.

## Monitores a crear (Manu, Better Stack o UptimeRobot)

| # | Objetivo | Frecuencia | Detalle |
|---|---|---|---|
| 1 | `https://maverlang.vercel.app/api/health` | 1 min | 2 regiones (p. ej. EE.UU. + Europa). Alerta si ≠ 200 o timeout. |
| 2 | `https://maverlang.vercel.app/api/health/deep` | 5 min | Header `Authorization: Bearer <CRON_SECRET>`. Alerta si ≠ 200. |
| 3 | `https://maverlang.vercel.app/` (landing) | 5 min | Keyword: buscar el texto `Maverlang` en el HTML. Alerta si no aparece. |

- **A quién alertar:** Manu, por correo + SMS o notificación de app (Better Stack/UptimeRobot lo configuran con la cuenta propia).
- **Página de estado pública:** Better Stack Status Page apuntando a `status.maverlang.cl` (CNAME). La página se arma y aloja en Better Stack; no hay código de estado propio en el repo.

## Qué hacer cuando cae cada dependencia

| Dependencia caída | Impacto en la app | Qué hacer |
|---|---|---|
| **Jupiter** | El mercado muestra el último precio guardado (caché) y los precios pasan a `reference`. El trading real se pausa solo (M70 valida la desviación antes de confirmar). | Revisar https://status.jup.ag (o la consola de Jupiter). Esperar; no requiere redeploy. Si persiste > 30 min, avisar en la cuenta de estado. |
| **Supabase** | Ingreso no disponible (Auth no responde), cartera y demo de usuarios no persisten. La app pública sigue sirviendo el catálogo en caché (5 min) y luego el snapshot. | Revisar https://status.supabase.com. Es crítico: la página de estado debe marcar degradación. |
| **xStocks** | El horario por acción cae al estado del catálogo/mock (M39). Menor. | Informativo; el trading sigue con el horario de respaldo. |
| **RPC de Solana** | Los multiplicadores Token-2022 quedan en 1 y las lecturas on-chain reintentan. Con RPC privado (Helius) revisar su status page. | Si es el RPC público, es rate-limit esperado: configurar `SOLANA_RPC_URL` privado. |
| **FX (mindicador)** | El dólar usa el último valor válido hasta 24 h (marcado `stale`) y el respaldo `open.er-api.com`. | Informativo; el fallback actúa solo. |
| **Koywe** | El on-ramp no está activo aún (M80); sin impacto en la beta. | Nada por ahora. |
| **La app entera (`/api/health` falla)** | Deploy caído o Vercel con problemas. | Revisar el deploy en Vercel (Runs). Si el último deploy rompió, rollback al anterior desde el dashboard. |

## Rotina de verificación después de un deploy

1. `curl -s https://maverlang.vercel.app/api/health` → `200` con el sha corto nuevo.
2. `curl -s -H "Authorization: Bearer $CRON_SECRET" https://maverlang.vercel.app/api/health/deep` → `200` con `checks.*.status` acorde al env.
3. Confirmar que los 3 monitores quedaron en verde en Better Stack/UptimeRobot.

## Notas de implementación

- Código: `app/api/health/route.ts`, `app/api/health/deep/route.ts`, `lib/health/checks.ts`.
- Tests: `tests/unit/health.test.ts` (rutas, lógica pura, probes con fetch falso, determinismo en mock, exclusiones, sin secretos).
- El token del deep se compara en tiempo constante (`timingSafeEqual`), igual que los crons (M55).
- `koywe` queda `skipped` hasta que M80 defina el endpoint de auth.

## Hook pre-commit contra secretos (OPS-2)

El repo trae un pre-commit sin dependencias en `.githooks/pre-commit`: corre
`node scripts/scan-secrets.mjs --staged` y bloquea el commit si el contenido
del índice (`git show :ruta`) trae claves. Cada clon lo activa una vez:

```sh
npm run hooks:install        # sólo imprime el comando
git config core.hooksPath .githooks
```

Se desactiva con `git config --unset core.hooksPath`. El `.gitignore` ya cubre la
basura de la raíz (`scratch*/`, `*.zip`, `continuo/`, `relanzar_*.ps1`,
`STOP_*.txt`, `.claude/`, etc.) para que `git add -A` no la suba. El escáner también
detecta `?api-key=`, claves base58 de Solana (87-88 caracteres), keypairs en JSON
y asignaciones `CRON_SECRET=`, `PRIVY_APP_SECRET=`, etc. con valores reales
(se ignoran vacíos y placeholders; `.env.example` y `tests/` están exentos).

## Secreto de service-role en un Environment protegido (OPS-8)

`company-facts.yml` y `underlying-prices.yml` declaran `environment: production-data`.
Hoy leen `SUPABASE_SECRET_KEY` de los secretos del repositorio; para que sólo
esos jobs lo vean y requieran aprobación (pasos en la interfaz de GitHub, a cargo de Manu):

1. Settings > Environments > New environment > `production-data`.
2. Required reviewers: agrega a Manu (y a un segundo revisor si existe).
   Deployment branches: sólo `main`.
3. En ese Environment, Add secret: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (si se usa), `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `APP_URL`, `REVALIDATE_SECRET`.
4. Borra esos mismos secretos de Settings > Secrets and variables > Actions (nivel repo).
5. Prueba con `workflow_dispatch` y `dry_run`: el job queda "Waiting" hasta aprobar.

Ojo: con revisores obligatorios, las corridas programadas (cron) esperan aprobación
manual. Si eso no es aceptable, deja sin revisores pero con restricción de rama
`main`, y rota la clave igual (ver `docs/INCIDENTES.md`). El CI principal usa
`npm ci` completo (corre el `postinstall` del parche de wallet-sdk); los dos
workflows de datos usan `--ignore-scripts` porque no cargan ese SDK.

## Sentry en edge (OBS-01)

`sentry.edge.config.ts` replica la política del servidor (sin PII, `scrubSentryEvent`
en eventos y spans). `instrumentation.ts` lo registra con `NEXT_RUNTIME === "edge"` y
`SENTRY_DSN`. En `@sentry/nextjs` 11 `beforeSendTransaction` no corre con span
streaming (por defecto), así que se limpia con `beforeSendSpan`.

## Incidentes

Runbook de respuesta: [`docs/INCIDENTES.md`](./INCIDENTES.md).
