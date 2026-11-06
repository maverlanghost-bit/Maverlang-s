# Launch a producción — runbook técnico

Para el operador que enciende dinero real. Fuentes: `docs/AUDITORIA-HANDOFF.md`,
`docs/HANDOFF-PRODUCCION-2026-11-04.md`, `AGENTS.md`, migraciones 0041–0051,
`lib/env.ts`, `lib/trade/real-guards.ts`, `lib/flags.ts` y el cron de billetera.
Lo desconocido va `[POR DEFINIR]`, lo legal `[REVISIÓN ABOGADO]`.
**Dinero real: NO GO** hasta cerrar la §9.

## 1. Candados y defaults fail-closed

| Control | Dónde | Default | Qué pasa si está cerrado |
|---|---|---|---|
| `REAL_EXECUTION_LOCKED` | `lib/trade/real-guards.ts` | `true` | 503 `REAL_DISABLED` en toda operación real, aunque `REAL_TRADING_READY=true` |
| `REAL_EXECUTION_UNLOCKED` | env de servidor | ausente | es la única llave del candado anterior (`=true` lo abre) |
| `REAL_TRADING_READY` | env (`lib/env.ts`) | `false` | 503 `REAL_DISABLED` antes de tocar servicios |
| `trading_enabled` | flag panel | `false` | 503 `TRADING_PAUSED` (cache 30 s) |
| `deposits_enabled` | flag `app_flags` | `false` | barrido de depósitos apagado |
| `withdrawals_enabled` | flag panel | `false` | 503 al armar salidas (`offramp_enabled` es clave heredada) |
| `WALLET_DEPOSIT_SYNC` | env | ausente | el barrido necesita `on`/`1`/`true` **y** el flag de arriba |
| `SPONSOR_ENABLED` | env | `false` | patrocinio de SOL apagado (KMS sigue stub: no prometerlo) |

El candado de ejecución va **primero**: sin él no se consulta la base. `deposits_enabled` no está en `ADMIN_FLAGS`: se cambia en `app_flags`.

## 2. Migraciones 0041–0051

Orden obligatorio, cada una idempotente y pegada por el operador en el SQL Editor:
`0041` RLS de billeteras/depósitos → `0042` reservas de cupo → `0043` RPC de
perfil → `0044` grants por columna → `0045` inmutabilidad del perfil → `0046`
onboarding con declaración versionada (`compliance_config`) → `0047` forward de
reservas → `0048` cuotas de patrocinio (no encender) → `0049` cotización en la
reserva compartida → `0050` desafíos de vinculación → `0051` libro de retiros.

- No aplicar `0038` después de `0043`: rompe el onboarding. No reaplicar la
  `0042` vieja: la base que ya la ejecutó necesita `0047`.
- Inventario previo: `node scripts/prepare-production-sql.mjs` (sólo lee; con
  `--write` deja `supabase/.temp/production-release-0041-0051.sql`). Exit 1 si
  falta un prefijo. Nunca ejecuta SQL.

## 3. `compliance_config` ↔ `US_PERSON_DECLARATION_VERSION`

`public.compliance_config` es fila única (`singleton=true`) y su
`us_person_declaration_version` debe ser **exactamente** igual a
`serverEnv.US_PERSON_DECLARATION_VERSION`. Rotación en la misma ventana: deploy
del nuevo valor → `select public.set_us_person_declaration_version('...')` como
`service_role` → `select public.sync_profile_regularization_plan()`.

Diagnóstico de un 503 `REAL_DISABLED`: buscar en el log del servidor
`[real-guards] declaración no verificable: <razón>`. Razones: `config_unavailable`
(lectura/RLS/red), `db_version_missing`, `db_version_invalid`,
`server_version_missing`, `server_version_invalid` o `version_mismatch` (el log
muestra `db=` y `env=`). El cliente sólo ve 503 genérico: nunca se elige una de
las dos fuentes ni se "corrige" el valor.

## 4. Variables de entorno obligatorias (sin valores)

- **Entorno/estricto**: `APP_ENV`, `SUPABASE_PROJECT_ENV`, `SUPABASE_PROD_URL_EXPECTED`.
- **Datos y auth**: `DATA_MODE`, `AUTH_MODE`, `NEXT_PUBLIC_AUTH_MODE`,
  `NEXT_PUBLIC_DATA_MODE`, `ALLOW_MOCK_AUTH` (no en Production con Supabase).
- **Supabase/sitio**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL` (https), `NEXT_PUBLIC_BRAND_NAME`.
- **Identidad y red**: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `SOLANA_RPC_URL`
  (https, no devnet), `JUPITER_BASE_URL`, `JUPITER_API_KEY`, `PRICES_MODE`,
  `MARKET_STATUS_MODE`.
- **Límite y crons**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `CRON_SECRET` (32+).
- **Cumplimiento y dinero**: `US_PERSON_DECLARATION_VERSION`, `REAL_TRADING_READY`,
  `REAL_EXECUTION_UNLOCKED`.

## 5. Pre-flight de entorno

`node scripts/check-production-ready.mjs` — imprime `OK`/`FALTA`/`AVISO` por
nombre, nunca por valor; exit 1 si falta algo obligatorio. Avisos no
bloqueantes: `WALLET_DEPOSIT_SYNC` y `SPONSOR_ENABLED`/KMS.

## 6. Activación ordenada y reversible

1. Respaldar la base y ensayar en staging (`docs/HANDOFF-PRODUCCION-2026-11-04.md`).
2. Aplicar 0041–0051 en orden; correr la consulta de verificación de grants.
3. Cargar env salvo `APP_ENV`/`SUPABASE_PROJECT_ENV`; esos dos al final.
4. Desplegar con `REAL_EXECUTION_UNLOCKED` **ausente** y comprobar que la cuenta
   real responde 503 (así se prueba que el candado funciona).
5. `REAL_TRADING_READY=true` + `DATA_MODE=live`; luego
   `REAL_EXECUTION_UNLOCKED=true`; redeploy y flags en orden: `trading_enabled` →
   `deposits_enabled` + `WALLET_DEPOSIT_SYNC=on` → `withdrawals_enabled`.
6. Cron `/api/cron/reconcile-wallet`: header `Authorization` con el token de
   `CRON_SECRET`, agendado en `vercel.json` (`20 13 * * *`, una vez al día). Sin
   token 401, sin `CRON_SECRET` 503, barrido incompleto 502; en mock 200 con ceros.
7. Cerrar beta (`beta_only=false`) recién con la §7 completa.

## 7. Verificación post-activación

- **Depósito mínimo**: `[POR DEFINIR]` (no hay constante en código; el on-ramp en pesos, con `ONRAMP_MIN_CLP`, sigue apagado por `PESO_DEPOSITS_ENABLED=false`).
- **Compra mínima**: `MIN_TRADE_USD=1` (`config/trade.ts`) y topes de `user_limits` por orden/día/mes/global en America/Santiago.
- **Retiro mínimo**: `[POR DEFINIR]`; tope por operación de US$500 (`lib/wallet/withdrawals.ts`), ajustable sólo a la baja con `WITHDRAWALS_MAX_USD_PER_OPERATION`. Sin tope diario/mensual.
- **Feed unificado**: `/api/wallet/activity` mezcla órdenes y `wallet_movements`,
  deduplica por `signature` y ordena descendente.
- **Conciliación**: revisar `reviewed/confirmed/failed/disappeared/pending`; una
  `pending` con firma se decide on-chain, sin firma no se cierra ni libera cupo.

## 8. Rollback

1. Quitar `REAL_EXECUTION_UNLOCKED` (o `REAL_TRADING_READY=false`) y redeploy:
   toda operación real vuelve a 503 en el siguiente request.
2. Apagar kill switches: `trading_enabled`, `withdrawals_enabled`,
   `deposits_enabled` (efecto hasta 30 s por cache). Para urgencia, redeploy.
3. Detener el cron: quitar el schedule de `vercel.json` o rotar `CRON_SECRET`.
4. Migraciones: **forward-only**; no revertir 0042/0047/0051. Si algo se aplicó
   mal, migración correctiva revisada + backup.
5. No volver el código por debajo de `a1c7f7d`: 0043/0044 ya bloquean el `UPDATE`
   directo a `profiles` y el código viejo rompe el perfil.

## 9. Pendientes NO GO (dinero real)

- **D-02**: el libro de retiros (0051) y la ruta existen, pero faltan topes
  diario/mensual, allowlist de destinos y verificación on-chain. Sigue abierto.
- **DB-03**: la declaración U.S. person ya se exige y versiona (0046), pero falta
  verificación independiente y KYC; el handoff lo mantiene abierto.
- **DB-06/07**: deriva de migraciones (17 "NO APLICADA", falta `0021`, `0025` no
  compilaba). T31 corrigió la cadena para base nueva; falta inventario real.
- **KYC/AML**: no implementado; la autodeclaración no lo sustituye.
- **Legal**: `TERMS_VERSION`, `PRIVACY_VERSION`, `RISKS_VERSION` en borrador
  `[REVISIÓN ABOGADO]`; faltan DPIA y DPA (Sentry/Vercel/Supabase/xAI). Ley 21.719
  desde el 2026-12-01 según la BCN.
- **Otros**: repo público y rotación de claves; webhook on-ramp sin HMAC (M-03);
  advisory de zod transitivo (DEP-01); `lib/solana/sponsorship/kms.ts` es stub.
