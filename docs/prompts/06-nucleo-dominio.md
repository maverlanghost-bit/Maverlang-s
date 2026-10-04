# T06 — Núcleo de dominio: tipos, contratos, env, mocks, servicios
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §4, §5, §6, §8.

Haz:
1. `lib/types/index.ts` con los tipos de §4 tal cual (puedes dividir en archivos).
2. `lib/api/contracts.ts`: schemas zod para cada request/response de §2.4; `lib/api/result.ts` con `ok()`, `fail()`, `ApiResult<T>` y mapeo de `ApiErrorCode` → HTTP.
3. `lib/env.ts`: `serverEnv` (zod, `import "server-only"`) y `publicEnv`. Defaults: `DATA_MODE=mock`, `FEE_BPS=0`, `PRICE_DEVIATION_MAX_BPS=150`.
4. `config/fees.ts` (lee env), completa `lib/format.ts` (CLP sin decimales, USD 2, acciones hasta 6, %, fechas relativas es-CL).
5. `lib/mocks/`: precios base por ticker (marcados `source:"mock"`), random walk determinista con seed, historial por rango, FX mock (~950 CLP/USD, marcado mock), cartera demo (3 posiciones + USDC), actividad, perfil demo, latencia 200–600 ms, `mockError` opcional.
6. `lib/services/`: interfaz `Services` (§5), implementación mock completa, archivos `*.live.ts` con firma y `throw new Error("NOT_IMPLEMENTED")` + TODO con endpoint/doc a usar; `getServices()` por `DATA_MODE`.
7. `lib/solana/allowlist.ts` usando `config/tickers.ts`.

Listo cuando: `npm run typecheck` sin errores.
Al terminar: PROGRESO.md + commit `T06: nucleo dominio`.
