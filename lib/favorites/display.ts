import { tickerBySymbol } from "@/config/tickers";

/** Presentación local: usa el símbolo oficial conocido sin modificar el contrato del servidor. */
export function displayFavoriteSymbols(symbols: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of symbols) {
    const symbol = value.trim();
    const key = symbol.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tickerBySymbol(symbol)?.symbol ?? symbol);
  }
  return out;
}

export function toggleFavoriteSymbol(symbols: readonly string[], symbol: string): string[] {
  const current = displayFavoriteSymbols(symbols);
  const key = symbol.trim().toLowerCase();
  if (!key) return current;
  return displayFavoriteSymbols(current.some((item) => item.toLowerCase() === key)
    ? current.filter((item) => item.toLowerCase() !== key)
    : [...current, symbol]);
}
