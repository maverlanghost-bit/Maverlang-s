import "server-only";

import { ONDO_TICKERS } from "@/config/ondo.generated";
import { TICKERS } from "@/config/tickers";
import {
  annotateSafety,
  applyListing,
  assetFromTicker,
  maxScopeFromEnv,
  searchCatalog,
  type CatalogAsset,
} from "@/lib/catalog/assets";
import { assignPublicSlugs, companySlug, displayTicker } from "@/lib/seo/slug";

/** Fecha del snapshot Ondo cuando la fila no trae `safety_checked_at`. */
const SNAPSHOT_DATE = "2026-10-07";
const CACHE_MS = 60 * 60 * 1000;

export type PublicAsset = {
  slug: string;
  name: string;
  /** Ticker de la empresa, sin sufijo de token (AAPL). */
  ticker: string;
  /** Símbolo del token en la app (AAPLx). */
  symbol: string;
  etf: boolean;
  /** ISO o YYYY-MM-DD para `lastModified` del sitemap. */
  updatedAt: string;
};

type Index = {
  rows: PublicAsset[];
  bySlug: Map<string, PublicAsset>;
  bySymbol: Map<string, PublicAsset>;
  byTicker: Map<string, PublicAsset>;
};

let cache: { at: number; index: Index } | null = null;

function updatedAtOf(asset: CatalogAsset): string {
  const raw = asset.safetyCheckedAt;
  if (raw && !Number.isNaN(Date.parse(raw))) return raw;
  return SNAPSHOT_DATE;
}

function toDraft(asset: CatalogAsset) {
  return {
    name: asset.name,
    ticker: displayTicker(asset.companyTicker, asset.underlying, asset.symbol),
    symbol: asset.symbol,
    etf: asset.category === "etf",
    updatedAt: updatedAtOf(asset),
  };
}

function ondoAsset(entry: (typeof ONDO_TICKERS)[number]): CatalogAsset {
  return {
    symbol: entry.symbol,
    name: entry.name,
    underlying: entry.ticker,
    category: entry.kind === "etf" ? "etf" : "other",
    mint: entry.mint,
    issuer: "ondo",
    companyTicker: entry.ticker,
    buy100CostBps: null,
    logoLocal: null,
    enabled: true,
    halted: false,
    liquidityUsd: null,
    curated: false,
    mode: null,
    period: null,
    openNow: null,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
    safetyStatus: "watch",
    safetyReasons: [],
    safetyTier: null,
    safetyCheckedAt: SNAPSHOT_DATE,
    tradable: false,
    underReview: true,
    transitionKept: false,
  };
}

/**
 * Una ficha por empresa con las mismas reglas del catálogo, sin red.
 * Sirve cuando Supabase no está o sólo devolvió el snapshot curado.
 */
function staticVisible(): CatalogAsset[] {
  const xstocks = TICKERS.map((ticker) => {
    const asset = assetFromTicker(ticker, true);
    if (!asset.enabled || asset.halted) return { ...asset, safetyStatus: "unknown" as const };
    return {
      ...asset,
      safetyStatus: "listed" as const,
      tradable: true,
      safetyCheckedAt: SNAPSHOT_DATE,
    };
  });
  const rows = annotateSafety([...xstocks, ...ONDO_TICKERS.map(ondoAsset)], true);
  return applyListing(rows, maxScopeFromEnv());
}

/** Todas las fichas visibles. `searchCatalog` pagina de a 50. */
async function liveVisible(): Promise<CatalogAsset[]> {
  const collected: CatalogAsset[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 40; page += 1) {
    const result = await searchCatalog({ page, pageSize: 50, sort: "name" });
    for (const item of result.items) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      collected.push(item);
    }
    if (!result.hasMore || result.items.length === 0) break;
  }
  return collected;
}

function indexRows(rows: PublicAsset[]): Index {
  const bySlug = new Map<string, PublicAsset>();
  const bySymbol = new Map<string, PublicAsset>();
  const byTicker = new Map<string, PublicAsset>();
  for (const row of rows) {
    bySlug.set(row.slug, row);
    bySymbol.set(row.symbol.toLowerCase(), row);
    byTicker.set(row.ticker.toLowerCase(), row);
    const tickerSlug = companySlug(row.ticker);
    if (tickerSlug) byTicker.set(tickerSlug, row);
  }
  return { rows, bySlug, bySymbol, byTicker };
}

async function loadIndex(): Promise<Index> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.index;
  let live: CatalogAsset[] = [];
  try {
    live = await liveVisible();
  } catch {
    live = [];
  }
  // El fallback de Supabase es sólo el snapshot curado (decenas de filas).
  // Con el catálogo real hay ~446 nombres. Por debajo de 400 se usa el snapshot local.
  const source = live.length >= 400 ? live : staticVisible();
  const rows = assignPublicSlugs(source.map(toDraft));
  const index = indexRows(rows);
  cache = { at: now, index };
  return index;
}

export async function listPublicAssets(): Promise<PublicAsset[]> {
  const index = await loadIndex();
  return index.rows;
}

/**
 * Resuelve el slug canónico, el símbolo del token (AAPLx) o el ticker (AAPL).
 * Null si no está en el catálogo visible.
 */
export async function resolvePublicAsset(raw: string): Promise<PublicAsset | null> {
  let key = raw.trim();
  if (!key) return null;
  try {
    key = decodeURIComponent(key);
  } catch {
    // Se queda el texto tal cual.
  }
  key = key.toLowerCase();
  const index = await loadIndex();
  return (
    index.bySlug.get(key) ??
    index.bySymbol.get(key) ??
    index.byTicker.get(key) ??
    index.byTicker.get(companySlug(key)) ??
    null
  );
}
