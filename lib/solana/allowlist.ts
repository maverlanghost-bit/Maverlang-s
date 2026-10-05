import { TICKERS, USDC_MINT, isOfficialMint, tickerBySymbol } from "@/config/tickers";
import type { Ticker } from "@/lib/types";

export { USDC_MINT, isOfficialMint, tickerBySymbol };

/**
 * SOL envuelto. No está en el catálogo y no se envía (`MINT_NOT_ALLOWED`).
 * El saldo de SOL nativo se muestra aparte, como gas.
 */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export type MintClass = "usdc" | "stock" | "disabled" | "sol" | "unknown";

export function tickerByMint(mint: string): Ticker | undefined {
  return TICKERS.find((ticker) => ticker.mint === mint);
}

export function isUsdcMint(mint: string): boolean {
  return mint === USDC_MINT;
}

export function isNativeSolMint(mint: string): boolean {
  return mint === NATIVE_SOL_MINT;
}

/** Mint del catálogo, aunque `enabled` sea false (HOODx, MSTRx). USDC no entra. */
export function isCatalogMint(mint: string): boolean {
  return TICKERS.some((ticker) => ticker.mint === mint);
}

/**
 * Separa un mint falso de uno apagado y de SOL.
 * Operar: sólo `usdc` y `stock`. El resto es `MINT_NOT_ALLOWED`.
 */
export function classifyMint(mint: string): MintClass {
  if (mint === USDC_MINT) return "usdc";
  if (mint === NATIVE_SOL_MINT) return "sol";
  const ticker = tickerByMint(mint);
  if (!ticker) return "unknown";
  return ticker.enabled ? "stock" : "disabled";
}

/** Igual que `isOfficialMint`: USDC o acción con `enabled`. */
export function isTradableMint(mint: string): boolean {
  return isOfficialMint(mint);
}

/** Mints con los que se puede comprar, vender o transferir. */
export function operableMints(): readonly string[] {
  return [USDC_MINT, ...TICKERS.filter((ticker) => ticker.enabled).map((ticker) => ticker.mint)];
}

/**
 * Ticker con el que se puede operar.
 * null si el símbolo no está o si `enabled` es false (HOODx, MSTRx al inicio).
 */
export function tradableTicker(symbol: string): Ticker | null {
  const ticker = tickerBySymbol(symbol);
  if (!ticker?.enabled) return null;
  if (!isOfficialMint(ticker.mint)) return null;
  return ticker;
}
