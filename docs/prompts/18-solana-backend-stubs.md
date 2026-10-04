# T18 — Librería Solana + stubs de backend live
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §6, §9, §10.

Haz (funciones puras, sin efectos al importar, `server-only` donde corresponda):
1. `lib/solana/scaled-ui.ts`: `getEffectiveMultiplier(config, nowSec)`, `rawToShares(raw: bigint, decimals, multiplier)`, `sharesToRaw(...)`, `rawPriceToSharePrice(price, multiplier)`; `fetchMintMultiplier(connection, mint)` leyendo la extensión ScaledUiAmount con `@solana/spl-token` (Token-2022) [VERIFICAR nombre exacto del helper en la versión instalada].
2. `lib/solana/fee.ts`: `computeFee(amountUsdcRaw, bps)` (bps=0 → null) y `buildFeeTransferIx({ from, feeWallet, amount })` con USDC (ATA idempotente).
3. `lib/solana/address.ts` (`isValidSolanaAddress`), `allowlist.ts` (ya existe; completar), `connection.ts` (cliente/servidor por env), `sponsor.ts` (stub `NOT_IMPLEMENTED`, comentario: requiere KMS).
4. En cada `lib/services/*.live.ts`, comentarios TODO precisos: endpoint, parámetros, mapeo a tipos, manejo de errores, cache. No implementar llamadas reales todavía.
5. Confirmar `supabase/migrations/0001_init.sql` presente y `lib/services/users.supabase.ts` con queries escritas pero detrás de `DATA_MODE=live`.
6. Revisar que ningún componente cliente importe `serverEnv`, `lib/solana/sponsor` ni servicios.

Listo cuando: typecheck ok; build no incluye código servidor en cliente.
Al terminar: PROGRESO.md + commit `T18: solana lib y stubs`.
