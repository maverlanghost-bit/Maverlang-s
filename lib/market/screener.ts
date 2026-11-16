import type { MarketSearchItem } from "@/lib/api/client";
import { fold, MARKET_FILTERS } from "@/lib/market/browse";
import type { Quote } from "@/lib/types";

export type ScreenerSort = "liquidity" | "gain" | "loss" | "name";
export type Issuer = "xstocks" | "ondo" | "unknown";
export interface ScreenerFilters {
  query: string;
  sector: string;
  issuer: "all" | Issuer;
  performance: "all" | "up" | "down" | "big";
  minLiquidity: number;
  sort: ScreenerSort;
}
export const DEFAULT_SCREENER: ScreenerFilters = { query: "", sector: "all", issuer: "all", performance: "all", minLiquidity: 0, sort: "liquidity" };
export const SCREENER_PAGE_SIZE = 50;

export function catalogIssuer(symbol: string): Issuer {
  const key = symbol.toLowerCase();
  return key.endsWith("on") ? "ondo" : key.endsWith("x") ? "xstocks" : "unknown";
}

export function parseScreener(search: string) {
  const params = new URLSearchParams(search);
  const sector = params.get("sector") ?? "all";
  const issuer = params.get("emisor");
  const performance = params.get("cambio");
  const sort = params.get("orden");
  const liquidity = Number(params.get("liquidez"));
  const filters: ScreenerFilters = {
    query: (params.get("q") ?? "").slice(0, 64),
    sector: MARKET_FILTERS.some((value) => value === sector && value !== "favorites") ? sector : "all",
    issuer: issuer === "xstocks" || issuer === "ondo" || issuer === "unknown" ? issuer : "all",
    performance: performance === "up" || performance === "down" || performance === "big" ? performance : "all",
    minLiquidity: [10_000, 50_000, 250_000].includes(liquidity) ? liquidity : 0,
    sort: sort === "name" || sort === "gain" || sort === "loss" ? sort : "liquidity",
  };
  const pages = Number(params.get("paginas"));
  const selectedKeys = new Set<string>();
  const selected = (params.get("seleccion") ?? "").split(",").map((symbol) => symbol.trim()).filter((symbol) => {
    const key = symbol.toLowerCase();
    if (!/^[a-z\d._-]{1,24}$/i.test(symbol) || selectedKeys.has(key)) return false;
    selectedKeys.add(key);
    return true;
  }).slice(0, 4);
  return { filters, pages: Number.isInteger(pages) && pages > 0 ? Math.min(20, pages) : 1, view: params.get("vista") === "heatmap" ? "heatmap" as const : "table" as const, selected };
}

export function screenerSearch(filters: ScreenerFilters, pages: number, view: string, selected: readonly string[]): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.sector !== "all") params.set("sector", filters.sector);
  if (filters.issuer !== "all") params.set("emisor", filters.issuer);
  if (filters.performance !== "all") params.set("cambio", filters.performance);
  if (filters.minLiquidity) params.set("liquidez", String(filters.minLiquidity));
  if (filters.sort !== "liquidity") params.set("orden", filters.sort);
  if (pages > 1) params.set("paginas", String(pages));
  if (view !== "table") params.set("vista", view);
  if (selected.length) params.set("seleccion", selected.join(","));
  return params.toString();
}

export interface ScreenerRow { item: MarketSearchItem; quote: Quote | null; issuer: Issuer }

export function screenerRows(items: readonly MarketSearchItem[], quotes: ReadonlyMap<string, Quote>, filters: ScreenerFilters): ScreenerRow[] {
  const needle = fold(filters.query.trim());
  const rows: ScreenerRow[] = [];
  for (const item of items) {
    const issuer = catalogIssuer(item.symbol);
    if (filters.sector !== "all" && item.category !== filters.sector) continue;
    if (filters.issuer !== "all" && issuer !== filters.issuer) continue;
    if (filters.minLiquidity && (item.liquidityUsd === null || !Number.isFinite(item.liquidityUsd) || item.liquidityUsd < filters.minLiquidity)) continue;
    if (needle && !fold(`${item.symbol} ${item.name} ${item.underlying}`).includes(needle)) continue;
    const quote = quotes.get(item.symbol.toLowerCase()) ?? null;
    const change = quote && Number.isFinite(quote.change24hPct) ? quote.change24hPct : null;
    if (filters.performance !== "all") {
      if (change === null) continue;
      if (filters.performance === "up" && change <= 0) continue;
      if (filters.performance === "down" && change >= 0) continue;
      if (filters.performance === "big" && Math.abs(change) < 0.03) continue;
    }
    rows.push({ item, quote, issuer });
  }
  return rows.sort((a, b) => {
    if (filters.sort === "gain" || filters.sort === "loss") {
      const left = a.quote && Number.isFinite(a.quote.change24hPct) ? a.quote.change24hPct : null;
      const right = b.quote && Number.isFinite(b.quote.change24hPct) ? b.quote.change24hPct : null;
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      if (left !== null && right !== null && left !== right) return filters.sort === "gain" ? right - left : left - right;
    }
    if (filters.sort === "liquidity") {
      const delta = (b.item.liquidityUsd ?? -1) - (a.item.liquidityUsd ?? -1);
      if (delta) return delta;
    }
    return a.item.name.localeCompare(b.item.name, "es-CL", { sensitivity: "base" }) || a.item.symbol.localeCompare(b.item.symbol);
  });
}
