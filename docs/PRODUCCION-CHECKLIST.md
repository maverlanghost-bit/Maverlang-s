# Checklist de salida a producción (demo con usuarios reales)

> Estado al 2026-11-21, rama `fix/auditoria-v3`. Alcance: **demo/paper** con usuarios reales
> (`DATA_MODE=mock`, `REAL_TRADING_READY=false`). El dinero real tiene su propia lista al final.
> Los pasos de esta página los hace una persona con acceso a GitHub, Vercel y Supabase: el código
> ya está listo para ellos, pero no los puede ejecutar por sí mismo.

## 1. GitHub (antes que todo)

- [ ] Repositorio `maverlanghost-bit/Maverlang-s` en **privado**.
- [ ] Rotar claves por precaución, en el orden de `docs/INCIDENTES.md` § Orden de rotación.
- [ ] Crear el Environment `production-data` con revisores obligatorios y mover ahí los secretos de
      los workflows programados (ver `docs/OPERACION.md`).
- [ ] En cada clon local: `git config core.hooksPath .githooks` (hook pre-commit con `scan:secrets --staged`).

## 2. Supabase producción

- [ ] Backup / PITR activo y **una restauración probada** (`docs/INCIDENTES.md` § Simulacro).
- [ ] Aplicar migraciones en **staging** primero y luego en producción, en el orden exacto de
      `docs/MIGRACIONES-PROD.md` (0045 → 0059). Antes, correr localmente:
      `node supabase/tests/run-migration-chain-tests.mjs` y
      `node supabase/tests/run-migrations-0055-0059-tests.mjs` (requisito en `supabase/tests/README.md`).
- [ ] Auth → Sessions: activar *time-box* e *inactivity timeout*.
- [ ] Auth → Providers → Email: activar **Secure password change** (reautenticación).
- [ ] Auth → Email templates (confirmación, magic link, recuperación, invitación): enlace a
      `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=<tipo>&next=/app`.
      El callback ya no verifica por GET: muestra `/auth/confirmar` y verifica con POST del mismo origen.
- [ ] Auth → URL configuration: Site URL `https://<dominio>` y redirect `https://<dominio>/auth/callback`.
- [ ] SMTP propio (Resend).

## 3. Vercel Production

El build de producción **falla a propósito** si falta cualquiera de estas variables
(`lib/env.ts`, `npm run check:env -- --env production`):

```text
APP_ENV=production
SUPABASE_PROJECT_ENV=prod
NEXT_PUBLIC_SITE_URL=https://<dominio>
AUTH_MODE=supabase
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY / SUPABASE_PROD_URL_EXPECTED
CRON_SECRET / REVALIDATE_SECRET
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
COPY_PLAN_HMAC_SECRET
DEMO_TOKEN_SECRET          (≥32 caracteres, nuevo)
SHARE_SIGNING_SECRET       (≥32 caracteres, nuevo)
PRIVY_APP_SECRET           (si existe NEXT_PUBLIC_PRIVY_APP_ID)
JUPITER_API_KEY, PRICES_MODE=live, MARKET_STATUS_MODE=live
DATA_MODE=mock, NEXT_PUBLIC_DATA_MODE=mock, REAL_TRADING_READY=false
```

- [ ] **No** definir `ALLOW_MOCK_AUTH` en Production (ahora es error con `AUTH_MODE=supabase`).
- [ ] Ninguna `NEXT_PUBLIC_*` con `api-key=` (p. ej. RPC de Helius): usar `SOLANA_RPC_URL`/`HELIUS_API_KEY`.
- [ ] `DEFAULT_SLIPPAGE_BPS` y `PRICE_DEVIATION_MAX_BPS`, si existen, deben ser ≤ 300 (si no, el arranque falla).
- [ ] Recomendado: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (sólo avisa si falta).
- [ ] `vercel.json` declara 6 crons: requiere plan Pro (o reducirlos).
- [ ] Cargar todo **antes** de mergear `fix/auditoria-v3` a `main`; luego redeploy.

## 4. Smoke tests después del deploy

- [ ] Landing, registro, confirmación de correo (pasa por `/auth/confirmar`), login, onboarding, guardar perfil.
- [ ] Usuario con TOTP: sin el segundo factor no ve datos de perfil.
- [ ] Compartir un chat del asistente: el enlace muestra el aviso de conversación compartida; "Revocar enlace" lo deja en 404.
- [ ] Pedir la baja de cuenta: responde la fecha y cierra la sesión.
- [ ] Cabeceras: CSP, HSTS; rate limit 429/503; crons 401 sin secreto y 200 con él.
- [ ] Sentry recibe un error de prueba sin PII.

## 5. Antes de activar dinero real (no es parte de este lanzamiento)

- [ ] KYC/AML, revisión legal, DPIA y DPA con proveedores (`docs/PENDIENTES-LEGALES.md`).
- [ ] Swap real en staging para validar dos controles nuevos que fallan cerrado:
      (a) el armado exige que el usuario sea el pagador de la transacción de Jupiter (si Jupiter usa
      modo *gasless*, hay que admitir su pagador conocido); (b) la conciliación sólo confirma si el
      mensaje on-chain coincide byte a byte con el armado (si no, la orden queda "en revisión").
- [ ] Contrato real del webhook del on-ramp (cabeceras y firma marcadas `[VERIFICAR]` en
      `lib/onramp/webhook-auth.ts`) e idempotencia durable por referencia del proveedor.
- [ ] Libreta de direcciones y enfriamiento de destinos de retiro en servidor.
- [ ] Guardar `lastValidBlockHeight` al armar retiros (hoy la conciliación usa el blockhash).
