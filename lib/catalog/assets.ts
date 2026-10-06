import "server-only";

import { TICKERS } from "@/config/tickers";
import { serverEnv } from "@/lib/env";
import { fold } from "@/lib/market/browse";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import type { Ticker } from "@/lib/types";

/**
 * Catálogo escalable (M38). Lee `public.assets` de Supabase con la clave
 * pública (SELECT público) y cache en memoria de 5 min. Si Supabase no está
 * configurado o falla, cae a `config/tickers.ts`.
 * Reutiliza `fold` (minúsculas sin acentos) y `selectCurated` de M37.
 */

export const CATALOG_CACHE_MS = 5 * 60 * 1000;
export const LOW_LIQUIDITY_USD = 10_000;
/**
 * PostgREST corta cada respuesta en 1000 filas como máximo: se pagina de a
 * 1000 con `offset` y orden estable para traer la tabla completa.
 */
const ASSETS_PAGE_SIZE = 1000;
const ASSETS_MAX_PAGES = 10;

const KNOWN_CATEGORIES = [
  "tech",
  "etf",
  "fintech",
  "consumer",
  "finance",
  "health",
  "energy",
  "industrial",
  "commodity",
] as const;

export type CatalogCategory = (typeof KNOWN_CATEGORIES)[number];
export type CatalogScope = "curated" | "all";
export type CatalogSort = "liquidity" | "name";

export interface CatalogAsset {
  symbol: string;
  name: string;
  underlying: string;
  category: CatalogCategory;
  /** Mint en Solana (vacío si la fila no lo trae). */
  mint: string;
  /** Ruta local (`/logos/…`) o null: nunca se hace hotlinking al logo remoto. */
  logoLocal: string | null;
  enabled: boolean;
  halted: boolean;
  liquidityUsd: number | null;
  curated: boolean;
}

export interface CatalogSearchParams {
  q?: string;
  category?: string;
  scope?: CatalogScope;
  page?: number;
  pageSize?: number;
  sort?: CatalogSort;
}

export interface CatalogSearchResult {
  items: CatalogAsset[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface AssetRow {
  symbol?: unknown;
  name?: unknown;
  underlying?: unknown;
  category?: unknown;
  mint_solana?: unknown;
  logo_path?: unknown;
  enabled?: unknown;
  is_trading_halted?: unknown;
  jupiter_liquidity_usd?: unknown;
  curated?: unknown;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function categoryOf(value: unknown): CatalogCategory {
  const raw = typeof value === "string" ? value.trim() : "";
  return (KNOWN_CATEGORIES as readonly string[]).includes(raw) ? (raw as CatalogCategory) : "tech";
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function assetFromRow(row: AssetRow): CatalogAsset | null {
  const symbol = text(row.symbol);
  if (!symbol) return null;
  const name = text(row.name) ?? symbol;
  return {
    symbol,
    name,
    underlying: text(row.underlying) ?? symbol.replace(/x$/i, ""),
    category: categoryOf(row.category),
    mint: text(row.mint_solana) ?? "",
    logoLocal: text(row.logo_path),
    enabled: row.enabled !== false,
    halted: row.is_trading_halted === true,
    liquidityUsd: numberOrNull(row.jupiter_liquidity_usd),
    curated: row.curated === true,
  };
}

export function assetFromTicker(ticker: Ticker, curated: boolean): CatalogAsset {
  return {
    symbol: ticker.symbol,
    name: ticker.name,
    underlying: ticker.underlying,
    category: ticker.category,
    mint: ticker.mint,
    logoLocal: ticker.logo,
    enabled: ticker.enabled,
    halted: false,
    liquidityUsd: null,
    curated,
  };
}

/** `CATALOG_SCOPE` es el máximo permitido: con `curated`, un pedido de `all` se ignora. */
export function resolveEffectiveScope(requested: CatalogScope | undefined, maxScope: CatalogScope): CatalogScope {
  if (maxScope === "curated") return "curated";
  return requested === "all" ? "all" : "curated";
}

export function maxScopeFromEnv(): CatalogScope {
  return serverEnv.CATALOG_SCOPE === "all" ? "all" : "curated";
}

/** Baja liquidez: menos de US$10.000. Sin dato, no se marca. */
export function isLowLiquidity(asset: Pick<CatalogAsset, "liquidityUsd">): boolean {
  return asset.liquidityUsd !== null && asset.liquidityUsd < LOW_LIQUIDITY_USD;
}

export function toTicker(asset: CatalogAsset): Ticker {
  return {
    symbol: asset.symbol,
    underlying: asset.underlying,
    name: asset.name,
    mint: asset.mint,
    decimals: 8,
    issuer: "Backed (xStocks)",
    category: asset.category,
    logo: asset.logoLocal ?? "",
    enabled: asset.enabled,
  };
}

function normalizePage(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || (value ?? 0) < 1) return fallback;
  return value as number;
}

/** Filtro + orden + paginación en memoria sobre filas ya cargadas. Pura: la usan los tests. */
export function searchAssets(rows: readonly CatalogAsset[], params: CatalogSearchParams): CatalogSearchResult {
  const effectiveScope = resolveEffectiveScope(params.scope, maxScopeFromEnv());
  const needle = fold(params.q?.trim() ?? "");
  const category = (params.category ?? "all").trim();
  const sort: CatalogSort = params.sort === "name" ? "name" : "liquidity";
  const pageSize = Math.min(Math.max(normalizePage(params.pageSize, 20), 1), 50);
  const page = normalizePage(params.page, 1);

  const filtered = rows.filter((asset) => {
    if (effectiveScope === "curated" && !asset.curated) return false;
    if (category !== "all" && category !== "" && asset.category !== category) return false;
    if (!needle) return true;
    return (
      fold(asset.symbol).includes(needle) ||
      fold(asset.underlying).includes(needle) ||
      fold(asset.name).includes(needle)
    );
  });

  const ordered = [...filtered].sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.symbol.localeCompare(b.symbol);
    }
    const left = a.liquidityUsd ?? -1;
    const right = b.liquidityUsd ?? -1;
    return right - left || a.symbol.localeCompare(b.symbol);
  });

  const total = ordered.length;
  const start = (page - 1) * pageSize;
  const items = ordered.slice(start, start + pageSize);
  return { items, total, page, pageSize, hasMore: start + pageSize < total };
}

interface AssetsCache {
  at: number;
  rows: CatalogAsset[];
  fromSupabase: boolean;
}

let cache: AssetsCache | null = null;

function isFresh(now: number): boolean {
  return cache !== null && now - cache.at < CATALOG_CACHE_MS;
}

/** Sólo para tests. */
export function __setAssetsCacheForTests(rows: CatalogAsset[], at: number): void {
  cache = { at, rows, fromSupabase: true };
}

/** Sólo para tests. */
export function __clearAssetsCacheForTests(): void {
  cache = null;
}

const ASSETS_COLUMNS = [
  "symbol",
  "name",
  "underlying",
  "category",
  "mint_solana",
  "logo_path",
  "enabled",
  "is_trading_halted",
  "jupiter_liquidity_usd",
  "curated",
].join(",");

async function fetchAssetsFromSupabase(fetchImpl: typeof fetch): Promise<CatalogAsset[] | null> {
  const config = readSupabasePublicConfig();
  if (!config) return null;
  const collected: CatalogAsset[] = [];
  for (let page = 0; page < ASSETS_MAX_PAGES; page += 1) {
    const url = new URL(`${config.url}/rest/v1/assets`);
    url.searchParams.set("select", ASSETS_COLUMNS);
    // Orden estable: las filas curadas primero y el resto por símbolo.
    url.searchParams.set("order", "curated.desc,symbol.asc");
    url.searchParams.set("limit", String(ASSETS_PAGE_SIZE));
    url.searchParams.set("offset", String(page * ASSETS_PAGE_SIZE));
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          apikey: config.publishableKey,
          authorization: `Bearer ${config.publishableKey}`,
        },
        cache: "no-store",
      });
    } catch {
      // Sin ninguna fila, se mantiene el fallback actual; con filas parciales
      // se usan las obtenidas para no dejar el mercado vacío.
      return collected.length > 0 ? collected : null;
    }
    if (!response.ok) return collected.length > 0 ? collected : null;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return collected.length > 0 ? collected : null;
    }
    if (!Array.isArray(body)) return collected.length > 0 ? collected : null;
    for (const entry of body) {
      if (entry !== null && typeof entry === "object") {
        const asset = assetFromRow(entry as AssetRow);
        if (asset) collected.push(asset);
      }
    }
    // Página no llena: era la última.
    if (body.length < ASSETS_PAGE_SIZE) break;
  }
  return collected;
}

function fallbackAssets(): CatalogAsset[] {
  // Sin Supabase (tests, e2e mock) el catálogo es config/tickers.ts: todo curado.
  return TICKERS.map((ticker) => assetFromTicker(ticker, true));
}

interface LoadedAssets {
  rows: CatalogAsset[];
  fromSupabase: boolean;
}

async function loadAssets(fetchImpl: typeof fetch, now: number): Promise<LoadedAssets> {
  if (isFresh(now) && cache) return { rows: cache.rows, fromSupabase: cache.fromSupabase };
  const rows = await fetchAssetsFromSupabase(fetchImpl);
  const next = rows ?? fallbackAssets();
  cache = { at: now, rows: next, fromSupabase: rows !== null };
  return { rows: next, fromSupabase: rows !== null };
}

/**
 * Salvaguarda: si Supabase responde filas pero ninguna es curada (sync
 * incompleto) y el alcance efectivo es `curated`, se usa el fallback de
 * `config/tickers.ts` para que el mercado nunca quede vacío. No se cachea el
 * reemplazo: el cache guarda las filas de Supabase para otros alcances.
 */
function withCuratedSafeguard(loaded: LoadedAssets, effectiveScope: CatalogScope): CatalogAsset[] {
  if (
    loaded.fromSupabase &&
    loaded.rows.length > 0 &&
    effectiveScope === "curated" &&
    !loaded.rows.some((asset) => asset.curated)
  ) {
    return fallbackAssets();
  }
  return loaded.rows;
}

export async function searchCatalog(
  params: CatalogSearchParams,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<CatalogSearchResult> {
  const loaded = await loadAssets(deps?.fetchImpl ?? fetch, deps?.now?.() ?? Date.now());
  const effectiveScope = resolveEffectiveScope(params.scope, maxScopeFromEnv());
  return searchAssets(withCuratedSafeguard(loaded, effectiveScope), params);
}

export async function findAssetBySymbol(
  symbol: string,
  deps?: { scope?: CatalogScope; fetchImpl?: typeof fetch; now?: () => number },
): Promise<CatalogAsset | null> {
  const wanted = symbol.trim().toLowerCase();
  if (!wanted) return null;
  const loaded = await loadAssets(deps?.fetchImpl ?? fetch, deps?.now?.() ?? Date.now());
  const effectiveScope = resolveEffectiveScope(deps?.scope, maxScopeFromEnv());
  const rows = withCuratedSafeguard(loaded, effectiveScope);
  const exact = rows.find((asset) => asset.symbol.toLowerCase() === wanted);
  if (!exact) return null;
  if (effectiveScope === "curated" && !exact.curated) return null;
  return exact;
}
