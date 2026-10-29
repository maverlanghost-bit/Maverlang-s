import "server-only";

import { findAssetBySymbol, searchCatalog, type CatalogAsset } from "@/lib/catalog/assets";
import { fold } from "@/lib/market/browse";

export interface ResolvedTicker {
  ticker: string;
  name: string;
  tradable: boolean;
}

export interface ResolveDeps {
  fetchImpl?: typeof fetch;
}

const PAGE_SIZE = 50;
const MAX_PAGES = 4;

function cleanQuery(query: string): string {
  return query.replace(/[?!.,;:()[\]{}'"]/g, " ").replace(/\s+/g, " ").trim();
}

/** Puntaje de un activo contra el texto. 0 = no sirve. */
export function scoreAsset(asset: Pick<CatalogAsset, "symbol" | "underlying" | "name">, query: string): number {
  const q = fold(cleanQuery(query));
  if (!q) return 0;
  const symbol = fold(asset.symbol);
  const underlying = fold(asset.underlying);
  const name = fold(asset.name);
  // "tslax" -> "tsla". No recortar palabras cortas que terminan en x ("max").
  const bare = /^(?:[a-z0-9.]{2,12})(?:x|on)$/.test(q) && q.length >= 4 ? q.replace(/(?:on|x)$/, "") : "";
  if (symbol === q) return 1000;
  if (underlying === q || (bare.length >= 1 && underlying === bare)) return 900;
  if (name === q) return 850;
  if (symbol.startsWith(q) || underlying.startsWith(q)) return 700;
  if (name.startsWith(q) || (name.length >= 3 && q.startsWith(name))) return 650;
  const word = name.split(/[^a-z0-9]+/).some((part) => part.length >= 3 && (part.startsWith(q) || q.startsWith(part)));
  if (word) return 600;
  if (symbol.includes(q) || underlying.includes(q) || name.includes(q)) return 400;
  if (name.length >= 3 && q.length >= 3 && q.includes(name)) return 400;
  return 0;
}

function pickBest(rows: readonly CatalogAsset[], query: string): CatalogAsset | null {
  const ranked = rows
    .map((asset) => ({ asset, score: scoreAsset(asset, query) }))
    .filter((row) => row.score >= 400)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const liquidA = a.asset.liquidityUsd ?? -1;
      const liquidB = b.asset.liquidityUsd ?? -1;
      if (liquidB !== liquidA) return liquidB - liquidA;
      return a.asset.symbol.localeCompare(b.asset.symbol);
    });
  const top = ranked[0];
  if (!top) return null;
  if (top.score >= 600) return top.asset;
  const second = ranked[1];
  if (!second || second.score < top.score) return top.asset;
  return null;
}

async function matchesFor(query: string, deps?: ResolveDeps): Promise<CatalogAsset[]> {
  const direct = await collectMatches(query, deps);
  if (direct.length > 0) return direct;
  const words = query.split(" ").filter((word) => word.length >= 3);
  if (words.length <= 1) return direct;
  const merged: CatalogAsset[] = [];
  const seen = new Set<string>();
  for (const word of words.slice(0, 4)) {
    const rows = await collectMatches(word, deps);
    for (const row of rows) {
      const key = row.symbol.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

async function collectMatches(query: string, deps?: ResolveDeps): Promise<CatalogAsset[]> {
  const first = await searchCatalog(
    { q: query, page: 1, pageSize: PAGE_SIZE, sort: "name" },
    deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : undefined,
  );
  const items = [...first.items];
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
  for (let page = 2; page <= pages; page += 1) {
    const next = await searchCatalog(
      { q: query, page, pageSize: PAGE_SIZE, sort: "name" },
      deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : undefined,
    );
    items.push(...next.items);
  }
  return items;
}

function toResolved(asset: CatalogAsset): ResolvedTicker {
  return { ticker: asset.symbol, name: asset.name, tradable: asset.tradable };
}

/**
 * Resuelve "tesla" o "TSLA" al símbolo visible del catálogo (p. ej. TSLAx).
 * Sólo activos que el mercado ya muestra. Si hay empate débil, null.
 */
export async function resolveTicker(query: string, deps?: ResolveDeps): Promise<ResolvedTicker | null> {
  const raw = cleanQuery(query);
  if (!raw || raw.length > 80) return null;
  const fetchDeps = deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : undefined;
  try {
    const exact = await findAssetBySymbol(raw, fetchDeps);
    if (exact && fold(exact.symbol) === fold(raw)) return toResolved(exact);
  } catch {
    console.error("ai chat resolve");
  }
  let matches: CatalogAsset[] = [];
  try {
    matches = await matchesFor(raw, deps);
  } catch {
    console.error("ai chat resolve");
    return null;
  }
  const best = pickBest(matches, raw);
  return best ? toResolved(best) : null;
}

/** Hasta 8 coincidencias del catálogo visible, de mayor a menor puntaje. */
export async function searchTickers(query: string, deps?: ResolveDeps): Promise<ResolvedTicker[]> {
  const raw = cleanQuery(query);
  if (!raw || raw.length > 80) return [];
  let matches: CatalogAsset[] = [];
  try {
    matches = await matchesFor(raw, deps);
  } catch {
    console.error("ai chat resolve");
    return [];
  }
  const ranked = matches
    .map((asset) => ({ asset, score: scoreAsset(asset, raw) }))
    .filter((row) => row.score >= 400)
    .sort((a, b) => b.score - a.score || a.asset.symbol.localeCompare(b.asset.symbol));
  const seen = new Set<string>();
  const out: ResolvedTicker[] = [];
  for (const row of ranked) {
    const key = row.asset.symbol.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toResolved(row.asset));
    if (out.length >= 8) break;
  }
  return out;
}
