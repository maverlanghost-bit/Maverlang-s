// Fuente de verdad: catálogo curado generado por scripts/sync-xstocks.mjs.
// En M37 CATALOG_SCOPE sólo usa `curated` (`all` queda para M38).
import type { Ticker } from "@/lib/types";

import { GENERATED_TICKERS } from "@/config/tickers.generated";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const TICKERS: Ticker[] = GENERATED_TICKERS.map((item) => ({
  symbol: item.symbol,
  underlying: item.underlying,
  name: item.name,
  mint: item.mint,
  decimals: item.decimals,
  issuer: item.issuer,
  category: item.category,
  logo: item.logo,
  enabled: item.enabled,
}));

export const ENABLED_TICKERS = TICKERS.filter((t) => t.enabled);
export const tickerBySymbol = (s: string) => TICKERS.find((t) => t.symbol.toLowerCase() === s.toLowerCase());
export const isOfficialMint = (mint: string) => mint === USDC_MINT || TICKERS.some((t) => t.mint === mint && t.enabled);
