# Handoff de auditoría — Maverlang / Queior

> **Estado al 2026-11-03.** Este documento es el handoff completo para el próximo LLM o desarrollador. Leerlo entero antes de tocar el proyecto. No asumir que todo lo auditado está corregido ni desplegado: el estado real está en la sección 1.

---

## Índice

1. [Contexto](#1-contexto)
2. [Estado actual del repo y del deploy](#2-estado-actual-del-repo-y-del-deploy)
3. [Hallazgos de la auditoría](#3-hallazgos-de-la-auditoría)
4. [Cambios implementados](#4-cambios-implementados)
5. [Migraciones y base de datos](#5-migraciones-y-base-de-datos)
6. [Evidencia de pruebas y build](#6-evidencia-de-pruebas-y-build)
7. [Qué está live y qué no](#7-qué-está-live-y-qué-no)
8. [Producción: Vercel y Supabase](#8-producción-vercel-y-supabase)
9. [Pendientes y bloqueantes](#9-pendientes-y-bloqueantes)
10. [Reglas para no romper nada](#10-reglas-para-no-romper-nada)
11. [Artefactos y comandos útiles](#11-artefactos-y-comandos-útiles)

---

## 1. Contexto

Plataforma **Maverlang Stocks / Queior**: compra de acciones de EE.UU. desde Chile con activos tokenizados, wallet, depósitos, trading y asistente IA.

- **Repo local:** `C:\Users\manue\OneDrive\Desktop\Maverlang-stocks`
- **GitHub:** `maverlanghost-bit/Maverlang-s` (sigue **público**)
- **Stack:** Next.js 16 (App Router), TypeScript, Supabase (auth/DB/RLS), Privy/Solana/Jupiter, Vercel, Sentry, Upstash.
- **Auditoría:** 2026-11-03, 4 agentes en paralelo + revisión manual.
- **Veredicto de negocio:** la **demo/paper** puede seguir; **dinero real = NO GO** hasta cerrar los bloqueantes de la sección 9.

---

## 2. Estado actual del repo y del deploy

| Rama | Commit | Estado |
|---|---|---|
| `main` | **`a1c7f7d`** | **Desplegado en producción** (hotfix C-01 + waitlist + T24–T28) |
| `origin/main` | `a1c7f7d` | Fast-forward sobre `2875a8c` |
| `fix/security-integration` | **`a4ffabf`** | Integración completa, build verde, **NO mergeada a main** |
| `fix/profiles-rpc` | `343f5ae` | C-01 original |
| `fix/auth-fail-closed` | `0818433` | A-01 |
| `fix/rate-limit-ip` | `a1b3f71` | A-02 |
| `fix/csp-headers` | `06c0b99` | CSP/headers |
| `fix/money-guards` | `d4c6570` | D-01/D-05/D-06 |
| `fix/ci-hardening` | `e1b9e5b` | CI/SEC-01 |
| `fix/sentry-scrub` | `dcb96ae` | M-02 |
| `deploy/c01` | `a1c7f7d` | Rama del deploy actual |

Todas las ramas `fix/*`, `deploy/c01` y `main` están **pusheadas a origin**.

### Deploy actual

- Proyecto Vercel real: `manuel-olivas-projects-92593eab/maverlang` (cuenta Vercel distinta a la del CLI disponible).
- Deployment: `4833s9DYWQfc3k9xPPgyqTSuCdfB`, estado **success**.
- URL viva: `https://maverlang.vercel.app` → HTTP 200.
- `X-Vercel-Id` cambió a `gru1::iad1::dzbwc-1793748052630...`.
- El sitio vivo corre en **modo mock** (no hay URL de Supabase en el bundle cliente).

> **Importante:** lo que está live es el **hotfix**, no la integración completa. No afirmar que auth fail-closed, rate limit, CSP, money guards o Sentry ya están en producción: están en `fix/security-integration`, listos pero sin desplegar.

---

## 3. Hallazgos de la auditoría

- **70 hallazgos brutos, ~62 únicos**: 2 críticos, 17 altos, 32 medios, 18 bajos, 1 informativo.
- Informe consolidado: `C:\Users\manue\OneDrive\Desktop\Auditoria-Queior\AUDITORIA-QUEIOR-v2.md`
- Plan de 4 agentes: `...\PLAN-4-AGENTES.md`
- Informes por agente:
  - `...\agentes\agente-1-auth-api.md`
  - `...\agentes\agente-2-datos-rls-pii.md`
  - `...\agentes\agente-3-dinero-wallet-trading.md`
  - `...\agentes\agente-4-web-ia-supplychain-ops.md`
- Fixes SQL listos para pegar:
  - `...\fixes\0043_profiles_rpc_clean.sql`
  - `...\fixes\0044_profiles_column_grants_clean.sql`
- Doc del fix C-01: `...\fixes\FIX-PERFILES-0043.md`

### Hallazgos que cambian decisiones

1. **C-01 / DB-01 / A1-02 (crítico):** `profiles` tenía `UPDATE` de fila completa para `authenticated`; cualquier usuario podía reescribir `onboarding_completed`, RUT, email, teléfono, fecha de nacimiento y campos de cumplimiento. **Corregido y verificado.**
2. **A-01 / A1-01 (crítico condicional):** la auth degradaba a mock sin error; un typo en `AUTH_MODE` podía convertir una cookie demo en sesión. **Corregido en la integración.**
3. **A-02 / A1-03 (alto):** rate limit evadible por `X-Forwarded-For` y fallback a memoria por lambda. **Corregido en la integración.**
4. **DB-03 (alto):** `is_us_person` era constante `false` en ambos flujos de alta. **Sigue abierto.**
5. **DB-06/07 (alto):** deriva de migraciones: 17 archivos “NO APLICADA”, falta `0021`, `0025` no compila, sin historial en la base. **Sigue abierto.**
6. **D-01 (alto):** `POST /api/wallet/send/build` no llamaba `assertRealExecutionLocked()`. **Corregido en la integración.**
7. **D-02 (alto):** no existe ruta de retiro; `validateAndPrepareWithdrawal` sin llamador. **Sigue abierto.**
8. **D-05 (medio):** se cerraban ejecuciones como `expired` sin evidencia de firma. **Corregido en la integración.**
9. **D-06 (medio):** cada cotización acumulaba una reserva; 3×US$200 agotaban el tope diario de US$500. **Corregido en la integración, requiere 0042 actualizada.**
10. **AI-01:** `/api/ai/chat` sin auth, amplificación de costo. **Corregido en la integración.**
11. **CI-02:** repo público. **Sigue abierto.**
12. **DEP-01:** zod anidado `3.25.76` en `@coinbase/cdp-sdk`, `@privy-io/api-base`, `@reown/appkit-wallet`, `x402`; subir el zod directo no lo arregla.
13. **M-03:** webhook on-ramp sin HMAC (latente tras `PESO_DEPOSITS_ENABLED`).
14. **M-05:** cotizaciones en `Map` en memoria (multi-lambda Vercel).

---

## 4. Cambios implementados

### 4.1 C-01 — `profiles` por RPC `security definer` (0043)

Archivos principales:

- `supabase/migrations/0043_profiles_rpc.sql` (364 líneas)
- `lib/services/users.rls.ts`
- `lib/supabase/schema-error.ts`
- `tests/unit/users-rls-rpc.test.ts`
- `tests/unit/profiles-rpc-migration.test.ts`
- `docs/FIX-PERFILES-0043.md`

Qué hace:

- `public.update_my_profile(p_patch jsonb)` `security definer`, `search_path = public, pg_temp`.
- Exige `auth.uid()`; si no hay sesión → `42501`.
- Lista blanca: `nombre, email, pais, rut, fecha_nacimiento, telefono, is_us_person, onboarding_completed, language, display_currency, residence_country, nationality_country, us_person_declaration_version, us_person_declared_at`.
- Valida largo de nombre/email, regex de email, país ISO-2, teléfono E.164, `language in ('es-CL','en')`, `display_currency in ('CLP','USD')`, fecha no futura y ≥18 años, RUT solo si `pais='CL'`.
- Países bloqueados: `US, PR, GU, VI, AS, MP, UM, CA, GB, AU, CU, IR, KP, SY, RU, BY`.
- `onboarding_completed=true` exige consentimientos `terminos` y `privacidad`; si faltan → `23514` (`faltan_consentimientos`).
- `us_person_declared_at` lo pone el servidor (`now()`), no el cliente.
- `public.add_my_consent(p_doc text, p_version text)` inserta como `auth.uid()`.
- Trigger `profiles_reject_client_locked_change`: el cliente solo puede tocar `nombre`, `language`, `display_currency`, `updated_at`; bypass con `current_setting('app.profile_write', true) = 'on'`; si el rol JWT no es `anon`/`authenticated`, deja pasar.
- Grants: `authenticated` solo `SELECT` + `UPDATE (nombre, language, display_currency)`; `EXECUTE` de las dos RPC.

Código:

- `update()` ahora llama `supabase.rpc("update_my_profile", { p_patch: body })`.
- `addConsent()` llama `supabase.rpc("add_my_consent", ...)`.
- Si la RPC no existe, **falla cerrado** con `PROFILE_MIGRATION_MESSAGE`; nunca vuelve al `UPDATE` directo.
- `isMissingSchemaError` amplía `PGRST202` y `42883`.

### 4.2 C-01 — 0044, limpieza de grants por columna

Archivo: `supabase/migrations/0044_profiles_column_grants.sql`

Motivo: **`REVOKE ALL ON TABLE` no revoca los grants por columna**. Si una migración/manual anterior dejó `GRANT UPDATE (columna)` sobre `rut`, `email`, etc., 0043 no los tocaba. 0044 recorre `information_schema.columns`, revoca `INSERT`/`UPDATE` por columna en `profiles` y `consents`, y vuelve a dejar:

- `profiles`: `SELECT` + `UPDATE (nombre, language, display_currency)`.
- `consents`: `SELECT`.

**Error corregido:** la primera versión intentó `DELETE (col)`; PostgreSQL no soporta `DELETE` a nivel de columna (`0LP01: invalid privilege type DELETE for column`). La versión final solo revoca `INSERT`/`UPDATE` por columna.

Verificación en la base:

```sql
select
  (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE') as update_tabla,
  (select count(*) from information_schema.role_column_grants where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE') as update_columnas,
  (select count(*) from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal and tgname='profiles_reject_client_locked_change') as trigger_0038;
```

Resultado confirmado por el usuario: **`0, 3, 1`**.

**Regla:** no aplicar `0038` después de `0043`; 0038 recrea el trigger sin el bypass y rompe el onboarding.

### 4.3 A-01 — auth fail-closed

Commit `0818433`; archivos:

- `lib/env.ts`
- `lib/auth/mode.ts`
- `lib/auth/gate.ts`
- `lib/services/auth.mock.ts`
- `lib/services/index.ts`
- `tests/unit/auth-fail-closed.test.ts`

Qué hace:

- `isProductionAuthRuntime()` considera `NODE_ENV`, `VERCEL_ENV` o `APP_ENV` en `production`.
- `ALLOW_MOCK_AUTH` solo acepta `true`/`1`/`yes`; ausencia = `false`.
- En producción, `AUTH_MODE=mock` sin `ALLOW_MOCK_AUTH=true` **no degrada**: falla cerrado.
- `AUTH_MODE=supabase` sin URL/clave pública **no degrada**: falla cerrado.
- El gate y los servicios usan la misma fuente de verdad.
- 26 tests.
- CI necesita `ALLOW_MOCK_AUTH: "true"` (ya agregado en `.github/workflows/ci.yml`).

### 4.4 A-02 — rate limit por IP de confianza

Commit `a1b3f71`; archivo `lib/security/rate-limit.ts` + tests.

Qué hace:

- Orden de IP: `x-real-ip` → `x-vercel-forwarded-for` (los pone la plataforma) → `x-forwarded-for` (último valor público, no el primero ciego).
- En producción **no usa memoria local**; si no hay Upstash, las políticas sensibles responden **503** (`unavailable`), no fail-open.
- Si Upstash falla, 503 rápido, sin reintentos.
- 23 tests.

**Consecuencia para producción:** `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` son obligatorias con la integración; sin ellas, search/cotizaciones/IA pueden devolver 503.

### 4.5 CSP y headers

Commit `06c0b99`; archivos `lib/security/csp.ts`, `lib/security/headers.ts` + tests.

Qué hace:

- Quita `*.supabase.co` del `connect-src` (el cliente no debe hablar con Supabase si la auth es server-side).
- Agrega `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control`.
- `CSP_MODE` default `enforce` en producción; `report-only` disponible como válvula de escape.
- 25 tests.
- Trusted Types **no** se activó porque `lib/seo/jsonld.tsx` usa `dangerouslySetInnerHTML`; hay test que fija esa decisión.

### 4.6 D-01/D-05/D-06 — guardas de dinero

Commit `d4c6570`; 15 archivos, +996/−41; 16 tests nuevos.

**D-01:**

- `app/api/wallet/send/build/route.ts` llama `assertRealExecutionLocked()` después de `assertRealTradingEnabled()` y antes de tocar servicios.
- Con `REAL_EXECUTION_LOCKED=true` responde **503 REAL_DISABLED** aunque `REAL_TRADING_READY=true` y `DATA_MODE=live`.
- `assertRealWithdrawalsEnabled()` nuevo en `lib/trade/real-guards.ts`; lee `getFlag`.
- `ADMIN_FLAGS` pasa de `offramp_enabled` a `withdrawals_enabled`; `offramp_enabled` queda como default heredado.
- `lib/wallet/withdrawals.ts`: tope **US$500 por operación** (`WITHDRAWALS_MAX_USD_PER_OPERATION` solo puede bajarlo), USDC 1:1, acciones valoradas con precio vivo, rechazo cerrado si no hay precio.
- Sin tope diario/mensual: requiere el libro de retiros de D-02.

**D-06:**

- `supabase/migrations/0042_trade_reservations.sql` actualizada:
  - `release_other_trade_reservations()`.
  - Se llama dentro de `reserve_trade_amount`, bajo los mismos advisory locks, antes de sumar cupo.
  - Índice único parcial `(user_id) where status='reserved'`.
  - Saneamiento previo para datos viejos.
- Dominio: `ReservationStore.releaseOthers`, `releaseOtherReservations()`, `reserveOrThrow` libera antes de insertar (fallback si la 0042 aplicada es la anterior).
- `app/api/trade/quote/route.ts` libera reservas previas **antes** de `assertRealTradeAllowed`, para que `checkLimits` no cuente dos veces.

**D-05:**

- `submit` deriva la firma base58 de la tx firmada (`readTransactionSignature`, `encodeBase58` en `lib/solana/address.ts`) y la guarda en el reclamo `pending` **antes** de `/execute`.
- `finalizeOrderExecution` ya no borra la firma si Jupiter no la devuelve.
- Conciliación: una orden **con firma** se decide on-chain; una `pending` **sin firma** no se cierra como `expired` ni libera cupo; queda abierta y se reporta en `summary.needsReview` + log.
- `mayReleaseReservation()`: `confirmed` nunca libera; `expired` solo con firma registrada.

**Caveats:**

- D-02 sigue abierto (no hay ruta de retiro).
- Sin allowlist de destinos ni tope diario/mensual.
- No se implementó estado `unknown` ni consulta a Jupiter por `requestId`.
- Un patch `failed` sin firma sí libera cupo (decisión: rechazo definitivo).
- **La 0042 actualizada no está aplicada en la base**; el código tiene fallback, pero el índice único requiere aplicarla.

### 4.7 M-02 — Sentry sin PII ni secretos

Commit `dcb96ae`; archivos:

- `lib/observability/redact.ts` (352 líneas)
- `sentry.server.config.ts`
- `instrumentation-client.ts`
- `tests/unit/observability-redact.test.ts`

Qué hace:

- `redactUrl`, `redactText`, `redactHeaders`, `redactCookies`, `redactQueryString`, `redactDeep`, `scrubSentryEvent`, `scrubSentryBreadcrumb`.
- Redacta `Authorization`, `Cookie`, `X-Api-Key`; query params `api-key`, `apikey`, `token`, `secret`, `access_token`, `key`; campos `email`, `rut`, `telefono`, `phone`, `password`, `token`, `secret`.
- `sendDefaultPii: false` y `dataCollection` restrictivo.
- 10 tests.

**Limitaciones:**

- Sentry 11.10 eliminó `sendDefaultPii` de tipos/runtime; se conserva por spread, pero el control efectivo es `dataCollection` (`userInfo`, `cookies`, `urlQueryParams`, `httpBodies`, `stackFrameVariables` en `false`).
- No hay `sentry.edge.config.ts` ni `withSentryConfig`: middleware y source maps siguen pendientes (OBS-01).
- No se cubre `beforeSendTransaction`.
- Redacción heurística: teléfonos sin `+56`, claves sin prefijo conocido y PII usada como nombre de campo no se detectan.

### 4.8 CI hardening / SEC-01

Commit `e1b9e5b`; archivos `.github/workflows/ci.yml`, `company-facts.yml`, `underlying-prices.yml`, `.github/dependabot.yml`, `scripts/scan-secrets.mjs`, `tests/unit/ci-workflow.test.ts`.

Qué hace:

- `permissions: { contents: read }` a nivel workflow; sin elevación en jobs.
- Actions pinneadas a SHA:
  - `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` (v4.4.0)
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)
  - `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2)
- `npm@11.19.0` exacto.
- Escaneo del bundle **después** de `npm run build`; `--require-bundle` falla si no hay bundle.
- `ALLOW_MOCK_AUTH: "true"` en el workflow.
- Dependabot para `github-actions`.
- 21 tests.
- CI-02 (repo privado) sigue en manos de Manu.

### 4.9 Waitlist build

Commit `2a2e715`: se quitó `export { WAITLIST_SUCCESS_MESSAGE }` de `app/api/waitlist/route.ts`; Next 16 no permite exports extra en `route.ts`. Los tests importan de `@/lib/waitlist/server`.

### 4.10 Documentación

- `Auditoria-Queior/AUDITORIA-QUEIOR-v1.md` (531 líneas, informe inicial).
- `Auditoria-Queior/AUDITORIA-QUEIOR-v2.md` (consolidado, estado y veredicto).
- `Auditoria-Queior/PLAN-4-AGENTES.md`.
- `Auditoria-Queior/TABLA-CONSOLIDADA.md`.
- `docs/FIX-PERFILES-0043.md` (incluye 0044 y verificación `0,3,1`).

---

## 5. Migraciones y base de datos

### Aplicadas y verificadas

- `0043_profiles_rpc.sql`: RPC de perfil/consentimientos + trigger + grants.
- `0044_profiles_column_grants.sql`: limpieza de grants por columna.

Verificación: **`update_tabla=0`, `update_columnas=3`, `trigger_0038=1`**.

### No aplicada

- `0042_trade_reservations.sql` **actualizada** (índice único parcial + `release_other_trade_reservations`). El código de la integración tiene fallback, pero el índice único y la garantía de una sola reserva activa requieren aplicarla.

### No aplicar

- `0038_profiles_lockdown.sql` después de `0043`: recrea el trigger sin el bypass `app.profile_write` y rompe el onboarding.

### Nota de drift

El audit detectó 17 migraciones “NO APLICADA”, falta `0021` y `0025` no compila. Antes de producción hay que reconciliar la cadena; probar en staging.

---

## 6. Evidencia de pruebas y build

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` (integración) | **0 errores** |
| `npx vitest run` (integración) | **135 archivos / 1265 tests passed** |
| `next build --webpack` (integración) | **exit 0**, `BUILD_ID: rghii4G8PHmKWhu5zhVL4` (sobre `e11f5db`; `a4ffabf` solo agrega docs) |
| `npx tsc --noEmit` (hotfix) | **0 errores** |
| `npx vitest run` (hotfix) | **130 archivos / 1180 tests passed** |
| `node scripts/scan-secrets.mjs` | **limpio** |
| Vercel deploy `a1c7f7d` | **success**, deployment `4833s9DYWQfc3k9xPPgyqTSuCdfB` |
| Sitio vivo | HTTP 200, `X-Vercel-Id` nuevo |

**No se ejecutó Playwright e2e en esta sesión.** Los specs existen (`e2e/*.spec.ts`) y el CI tiene job `e2e`, pero no corrieron localmente. No afirmar “e2e verde”.

**Falso positivo corregido:** el test de Sentry tenía un JWT literal; el escáner lo detectaba. Se cambió a un token construido en runtime (`["header","payload","firma"].join(".")`) para que `scan:secrets` siga limpio sin debilitar la detección.

---

## 7. Qué está live y qué no

### Live en `main` `a1c7f7d`

- C-01: código de perfiles por RPC + migraciones 0043/0044 documentadas.
- Fix del build de waitlist.
- Commits T24–T28 que estaban en el `main` local y no en GitHub.
- El sitio vivo sigue en **mock**; el RPC se activará cuando se pase a Supabase.

### No live

- `fix/security-integration` (`a4ffabf`): auth fail-closed, rate limit, CSP, money guards D-01/D-05/D-06, Sentry scrub, CI hardening.
- La razón: el proyecto Vercel real (`manuel-olivas-projects-92593eab/maverlang`) está en otra cuenta; el CLI disponible (`mbrop13` / `manuels-projects-f71a000ebb`) no puede tocar sus env vars. Sin `ALLOW_MOCK_AUTH=true` o sin pasar a Supabase, la integración rechazaría la demo mock.

### Base de datos

- 0043 y 0044 aplicadas; verificación `0, 3, 1`.
- 0042 actualizada **no aplicada**.
- 0038 **no aplicar después de 0043**.

---

## 8. Producción: Vercel y Supabase

Proyecto correcto: `https://vercel.com/manuel-olivas-projects-92593eab/maverlang`.

### Settings de Vercel

- Framework Preset: **Next.js**.
- Build Command: `npm run build`.
- Output Directory: `.next`.
- Install Command: `npm ci`.
- Node.js: **22.x**.
- Root Directory: `.`.
- Production Branch: `main`.
- Deployment Protection: Preview protegido, Production público.
- Cron Jobs: `vercel.json` tiene **6**; si el plan es Hobby, no caben (Hobby: 2/día). Subir a Pro o reducir.
- Región de funciones: `gru1` opcional.

### Variables obligatorias en Production

Si falta una, el build estricto falla:

```text
APP_ENV=production
SUPABASE_PROJECT_ENV=prod
NEXT_PUBLIC_SITE_URL=https://<dominio>
AUTH_MODE=supabase
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref-prod>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=***            # server-only
SUPABASE_PROD_URL_EXPECTED=https://<ref-prod>.supabase.co
CRON_SECRET=*** caracteres>
REVALIDATE_SECRET=***
JUPITER_API_KEY=***
PRICES_MODE=live
MARKET_STATUS_MODE=live
UPSTASH_REDIS_REST_URL=<url>
UPSTASH_REDIS_REST_TOKEN=<token>             # server-only
```

### Config segura sin dinero real

```text
DATA_MODE=mock
NEXT_PUBLIC_DATA_MODE=mock
REAL_TRADING_READY=false
CATALOG_SCOPE=curated
GEO_BLOCKED_COUNTRIES=US
```

### Recomendadas / por función

`XAI_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`, `RESEND_API_KEY`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`, `SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `TERMS_VERSION`, `PRIVACY_VERSION`, `RISKS_VERSION`, `FEE_BPS`, `FEE_WALLET`, `ONRAMP_PROVIDER`, `KOYWE_*`, `HELIUS_API_KEY`.

### No poner en Production

- `ALLOW_MOCK_AUTH` si `AUTH_MODE=supabase`. Solo va en Preview si los previews siguen en mock.
- Secretos en variables `NEXT_PUBLIC_*`.
- Secretos de producción en Preview.

### Supabase producción

- Proyecto separado del dev.
- Migraciones `0001 → 0044`, incluida la 0042 actualizada.
- Auth Site URL `https://<dominio>`; redirect `https://<dominio>/auth/callback`.
- SMTP propio (Resend).
- RLS/grants verificados; backups diarios/PITR y restauración probada.
- DB-06/07 sigue abierto: 17 migraciones “NO APLICADA”, falta `0021`, `0025` no compila. Probar la cadena en staging antes de producción.

### Orden de despliegue

1. Repo privado + rotar claves.
2. Crear/configurar Supabase producción y aplicar migraciones.
3. Cargar env vars de Production, excepto `APP_ENV` y `SUPABASE_PROJECT_ENV`.
4. Poner `APP_ENV=production` y `SUPABASE_PROJECT_ENV=prod` al final.
5. Mergear `fix/security-integration` a `main` (con `AUTH_MODE=supabase` no necesita `ALLOW_MOCK_AUTH`).
6. Redeploy; si falla, `check-env` dice qué falta.
7. Smoke tests: landing, registro/login, onboarding, guardado de perfil, CSP/HSTS, rate limit 429/503, cron 401/200, IA autenticada, Sentry sin PII.
8. Dominio/DNS; actualizar `NEXT_PUBLIC_SITE_URL`, redirect de Supabase y allowed origins de Privy; redeploy.

### Veredicto

- **Demo/paper** (`DATA_MODE=mock`, `REAL_TRADING_READY=false`): puede salir si Vercel + Supabase + legal básico están listos.
- **Dinero real: NO GO** hasta cerrar D-02 (retiros), DB-03 (`is_us_person` real), DB-06/07 (migraciones), KYC/AML, DPIA/Ley 21.719 y rotación de claves.

---

## 9. Pendientes y bloqueantes

1. **D-02**: no existe ruta de retiro; `validateAndPrepareWithdrawal` sin llamador.
2. **DB-03**: `is_us_person` sigue siendo constante `false`; la UI nunca pregunta.
3. **DB-06/07**: deriva de migraciones; 17 “NO APLICADA”, falta `0021`, `0025` no compila.
4. **KYC/AML**: no implementado; bloqueante de dinero real.
5. **Legal**: `TERMS_VERSION`, `PRIVACY_VERSION`, `RISKS_VERSION` en `2026-10-draft`; falta revisión de abogado, DPIA y DPA con Sentry/Vercel/Supabase/xAI.
6. **Repo público**: `maverlanghost-bit/Maverlang-s` sigue público; rotar Supabase service key, Privy app secret, Jupiter, Upstash, Resend, xAI, `CRON_SECRET`, `REVALIDATE_SECRET`, Helius, Koywe.
7. **0042 actualizada** sin aplicar; el fix D-06 la necesita para el índice único.
8. **M-03**: webhook on-ramp sin HMAC; latente tras `PESO_DEPOSITS_ENABLED`.
9. **M-05**: cotizaciones en `Map` en memoria; multi-lambda.
10. **DEP-01**: zod anidado `3.25.76`.
11. **Sentry**: sin `sentry.edge.config.ts`/`withSentryConfig`; sin `beforeSendTransaction`.
12. **Upstash**: obligatorio con la integración; sin él, rate-limited routes 503.
13. **`ALLOW_MOCK_AUTH`**: solo Preview/mock; no Production con Supabase.

---

## 10. Reglas para no romper nada

- **No rehacer C-01**: ya está aplicado en DB y desplegado en `main`.
- **No aplicar `0038` después de `0043`**: recrea el trigger sin bypass y rompe onboarding.
- **No usar `DELETE (columna)`** en 0044: PostgreSQL no lo soporta; solo `INSERT`/`UPDATE` por columna.
- **No hacer `UPDATE` directo a `profiles`** desde el cliente: ya no hay grants; usar las RPC.
- **No usar `service_role` en el cliente**: solo servidor.
- **No mergear `fix/security-integration` sin env**: auth fail-closed rechaza mock en producción sin `ALLOW_MOCK_AUTH`; con Supabase, configurar todo antes.
- **No poner `ALLOW_MOCK_AUTH=true` en Production con Supabase**.
- **No afirmar que la integración completa está live**: `main` es el hotfix.
- **No aplicar la 0042 actualizada a ciegas**: probar en staging; tiene índice único y saneamiento.
- **No commitear secretos**: el repo sigue público.
- **No correr migraciones en producción sin backup**.
- **Rollback de código**: no volver por debajo de `a1c7f7d`; 0043/0044 bloquean el `UPDATE` directo y el código viejo rompería el perfil. Si hay que volver, re-grant temporal o fix forward.

---

## 11. Artefactos y comandos útiles

- Repo: `C:\Users\manue\OneDrive\Desktop\Maverlang-stocks`
- Auditoría: `C:\Users\manue\OneDrive\Desktop\Auditoria-Queior\`
- SQL limpio: `...\fixes\0043_profiles_rpc_clean.sql`, `...\fixes\0044_profiles_column_grants_clean.sql`
- Doc: `...\fixes\FIX-PERFILES-0043.md`
- Validar entorno producción: `node scripts/check-env.mjs --env production`
- Escanear secretos: `node scripts/scan-secrets.mjs` (y `--history`)
- Tests: `npx vitest run`; typecheck: `npx tsc --noEmit`
- Build: `npx next build --webpack` (usar `--webpack`; Turbopack falla con el junction de `node_modules`)
- Verificación DB: la consulta de 3 números (`0, 3, 1`)
- Estado remoto: `git ls-remote origin refs/heads/main`
- Deployment: GitHub commit status `Vercel` en `a1c7f7d`; Vercel deployment `4833s9DYWQfc3k9xPPgyqTSuCdfB`

---

**Resumen en una línea:** C-01 está cerrado en DB (`0,3,1`) y desplegado en `main` (`a1c7f7d`); la integración completa (`a4ffabf`) está construida, testeada y pusheada pero **no desplegada**; para producción falta configurar Vercel/Supabase, y para dinero real siguen abiertos D-02, DB-03, DB-06/07, KYC/AML y legal.
