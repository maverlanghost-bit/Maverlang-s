import type { Currency, Quote, Ticker } from "@/lib/types";

export const MARKET_FILTERS = [
  "all",
  "tech",
  "etf",
  "fintech",
  "consumer",
  "finance",
  "health",
  "energy",
  "industrial",
  "commodity",
  "favorites",
] as const;
export type MarketFilter = (typeof MARKET_FILTERS)[number];

export const MARKET_SORTS = ["popular", "gain", "loss", "az"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function parseFilter(value: string | null | undefined): MarketFilter {
  if (value && (MARKET_FILTERS as readonly string[]).includes(value)) return value as MarketFilter;
  return "all";
}

export function parseSort(value: string | null | undefined): MarketSort {
  if (value && (MARKET_SORTS as readonly string[]).includes(value)) return value as MarketSort;
  return "popular";
}

/** Minúsculas y sin acentos, para comparar símbolo, nombre y subyacente. */
export function fold(value: string): string {
  COMBINING_MARKS.lastIndex = 0;
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

export function matchesQuery(ticker: Pick<Ticker, "symbol" | "name" | "underlying">, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return [ticker.symbol, ticker.name, ticker.underlying].some((field) => fold(field).includes(needle));
}

export function passesFilter(ticker: Ticker, filter: MarketFilter, favorites: ReadonlySet<string>): boolean {
  if (!ticker.enabled) return false;
  if (filter === "all") return true;
  if (filter === "favorites") return favorites.has(ticker.symbol);
  return ticker.category === filter;
}

export type MarketRow = {
  ticker: Ticker;
  quote: Quote;
  /** Posición en la respuesta de `/api/tickers` (orden de config = Popular). */
  index: number;
};

function changeOf(row: MarketRow): number {
  return Number.isFinite(row.quote.change24hPct) ? row.quote.change24hPct : 0;
}

function compareRows(a: MarketRow, b: MarketRow, sort: MarketSort): number {
  if (sort === "az") {
    const byName = a.ticker.name.localeCompare(b.ticker.name, "es", { sensitivity: "base" });
    return byName || a.index - b.index;
  }
  if (sort === "gain" || sort === "loss") {
    const delta = changeOf(a) - changeOf(b);
    const directed = sort === "gain" ? -delta : delta;
    return directed || a.index - b.index;
  }
  return a.index - b.index;
}

export function sortRows(rows: readonly MarketRow[], sort: MarketSort): MarketRow[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort));
}

/** Top por |variación|. Criterio objetivo: no es una selección editorial. */
export function moversOf(rows: readonly MarketRow[], limit = 3): MarketRow[] {
  return [...rows]
    .sort((a, b) => Math.abs(changeOf(b)) - Math.abs(changeOf(a)) || a.index - b.index)
    .slice(0, limit);
}

export function displayPrice(priceUsd: number, currency: Currency, rate: number | undefined): number | null {
  const value = currency === "USD" ? priceUsd : rate === undefined ? null : priceUsd * rate;
  return value !== null && Number.isFinite(value) ? value : null;
}

/** Fila lista para el desplegable del buscador (N20). Sin precio visible se omite. */
export interface Suggestion {
  symbol: string;
  name: string;
  underlying: string;
  logoUrl: string | null;
  price: number;
  currency: Currency;
  change: number | null;
}

export function topSuggestions(
  rows: readonly {
    item: { symbol: string; name: string; underlying: string; logoUrl: string | null };
    quote: Quote;
  }[],
  currency: Currency,
  rate: number | undefined,
  limit = 6,
): Suggestion[] {
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shown: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const out: Suggestion[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const price = displayPrice(row.quote.priceUsd, shown, fxKnown ? rate : undefined);
    if (price === null) continue;
    out.push({
      symbol: row.item.symbol,
      name: row.item.name,
      underlying: row.item.underlying,
      logoUrl: row.item.logoUrl,
      price,
      currency: shown,
      change: Number.isFinite(row.quote.change24hPct) ? row.quote.change24hPct : null,
    });
  }
  return out;
}

/** Menos puntos para el sparkline, conservando el primero y el último. */
export function downsample(values: readonly number[], max = 32): number[] {
  if (values.length <= max) return [...values];
  const last = max - 1;
  const out: number[] = [];
  for (let index = 0; index < max; index += 1) {
    const source = Math.round((index * (values.length - 1)) / last);
    out.push(values[source] ?? 0);
  }
  return out;
}
