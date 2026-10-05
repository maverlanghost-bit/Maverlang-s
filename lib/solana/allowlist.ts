import { TICKERS, USDC_MINT, isOfficialMint, tickerBySymbol } from "@/config/tickers";
import type { Ticker } from "@/lib/types";

export { USDC_MINT, isOfficialMint, tickerBySymbol };

export function tickerByMint(mint: string): Ticker | undefined {
  return TICKERS.find((ticker) => ticker.mint === mint);
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
