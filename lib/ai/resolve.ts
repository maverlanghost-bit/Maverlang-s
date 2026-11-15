import "server-only";

import { findAssetBySymbol, searchCatalog, type CatalogAsset } from "@/lib/catalog/assets";
import { CRYPTO_ASSETS, findCryptoBySymbol, type CryptoAsset } from "@/lib/catalog/crypto";
import { EARN_ASSETS, findEarnBySymbol } from "@/lib/catalog/lst";
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

function resolveDigitalAsset(raw: string): ResolvedTicker | null {
  const exactCrypto = findCryptoBySymbol(raw);
  if (exactCrypto) return { ticker: exactCrypto.symbol, name: exactCrypto.name, tradable: true };
  const exactEarn = findEarnBySymbol(raw);
  if (exactEarn) return { ticker: exactEarn.symbol, name: exactEarn.name, tradable: true };

  const q = fold(raw);
  if (!q || q.length < 3) return null;
  const pool: readonly Pick<CryptoAsset, "symbol" | "name">[] = [...CRYPTO_ASSETS, ...EARN_ASSETS];
  let best: { asset: Pick<CryptoAsset, "symbol" | "name">; score: number } | null = null;
  for (const item of pool) {
    const score = scoreAsset({ symbol: item.symbol, underlying: item.symbol, name: item.name }, q);
    if (score < 650) continue;
    if (!best || score > best.score) best = { asset: item, score };
  }
  return best ? { ticker: best.asset.symbol, name: best.asset.name, tradable: true } : null;
}

function searchDigitalAssets(raw: string): ResolvedTicker[] {
  const q = fold(raw);
  if (!q) return [];
  const pool: readonly Pick<CryptoAsset, "symbol" | "name">[] = [...CRYPTO_ASSETS, ...EARN_ASSETS];
  const scored: { ticker: string; name: string; score: number }[] = [];
  for (const item of pool) {
    const score = scoreAsset({ symbol: item.symbol, underlying: item.symbol, name: item.name }, q);
    if (score >= 400) scored.push({ ticker: item.symbol, name: item.name, score });
  }
  scored.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  return scored.slice(0, 6).map((item) => ({ ticker: item.ticker, name: item.name, tradable: true }));
}

/**
 * Resuelve "tesla", "TSLA", "bitcoin" o "SOL" al símbolo visible del catálogo.
 * Prioriza acciones del mercado y, si coincide por símbolo o nombre con cripto/LST,
 * devuelve el token verificado de Solana.
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
  const exactDigital = findCryptoBySymbol(raw) ?? findEarnBySymbol(raw);
  if (exactDigital && fold(exactDigital.symbol) === fold(raw)) {
    return { ticker: exactDigital.symbol, name: exactDigital.name, tradable: true };
  }
  let matches: CatalogAsset[] = [];
  try {
    matches = await matchesFor(raw, deps);
  } catch {
    console.error("ai chat resolve");
    return resolveDigitalAsset(raw);
  }
  const best = pickBest(matches, raw);
  if (best) return toResolved(best);
  return resolveDigitalAsset(raw);
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
    matches = [];
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
  for (const digital of searchDigitalAssets(raw)) {
    if (out.length >= 8) break;
    const key = digital.ticker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(digital);
  }
  return out;
}
