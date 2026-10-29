import "server-only";

import { readdirSync } from "node:fs";
import path from "node:path";
import { cache } from "react";

import { ONDO_TICKERS } from "@/config/ondo.generated";
import { TICKERS } from "@/config/tickers";
import { logoPathIfPresent } from "@/lib/catalog/logos";
import { serverEnv } from "@/lib/env";
import { isTradableStatus } from "@/lib/catalog/safety-core.mjs";
import { fold } from "@/lib/market/browse";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import type { Ticker } from "@/lib/types";

/**
 * Catálogo escalable (M38/M38b/M54). Lee `public.assets` de Supabase con la
 * clave pública (SELECT público) y cache en memoria de 5 min. Si Supabase no
 * está configurado o falla, cae al snapshot `config/tickers.ts` (los curados
 * operan, nunca se permite un mint desconocido).
 * Reutiliza `fold` (minúsculas sin acentos) y `selectCurated` de M37.
 * Desde M54 el filtro por alcance usa el estado de seguridad (M53):
 * `listed` = filas `listed` + `watch` (más curadas en transición), `hidden`
 * nunca aparece. `curated` incluye además las Ondo en `watch` o `listed`,
 * porque la demo pública fija `CATALOG_SCOPE=curated`. Operar exige `tradable`.
 */

export const CATALOG_CACHE_MS = 5 * 60 * 1000;
/** Tope de cada lectura a Supabase. Un socket colgado no puede llegar a los 60 s. */
const CATALOG_FETCH_MS = 4_000;
export const LOW_LIQUIDITY_USD = 10_000;
/**
 * PostgREST corta cada respuesta en 1000 filas como máximo: se pagina de a
 * 1000 con `offset` y orden estable para traer la tabla completa.
 */
const ASSETS_PAGE_SIZE = 1000;
const ASSETS_MAX_PAGES = 10;

let logoFiles: ReadonlySet<string> | null = null;

/** Nombres de archivo en `public/logos`, leídos una vez. Si la carpeta falta, vacío. */
function logoFileSet(): ReadonlySet<string> {
  if (logoFiles) return logoFiles;
  try {
    logoFiles = new Set(readdirSync(path.join(process.cwd(), "public", "logos")));
  } catch {
    logoFiles = new Set();
  }
  return logoFiles;
}

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
  "other",
] as const;

export type CatalogCategory = (typeof KNOWN_CATEGORIES)[number];
export type CatalogScope = "curated" | "listed" | "all";
export type CatalogSort = "liquidity" | "name";
/** Estado de seguridad por activo (M53, columna `safety_status`). */
export type SafetyStatus = "listed" | "watch" | "hidden" | "unknown";
/** Emisor del token (M52b, columna `issuer`): Backed/xStocks u Ondo Stocks. */
export type AssetIssuer = "xstocks" | "ondo";

export interface CatalogAsset {
  symbol: string;
  name: string;
  underlying: string;
  category: CatalogCategory;
  /** Mint en Solana (vacío si la fila no lo trae). */
  mint: string;
  /** Emisor del token (M52b). Sin columna en la base, es `xstocks`. */
  issuer: AssetIssuer;
  /**
   * Ticker del subyacente (M52b, columna `company_ticker`): agrupa una ficha
   * por empresa entre emisores. Sin dato, cae al subyacente.
   */
  companyTicker: string;
  /**
   * Costo de compra US$100 en bps de la última corrida (`safety_metrics`),
   * o null. Desempata la ficha por empresa (M52b).
   */
  buy100CostBps: number | null;
  /** Ruta local (`/logos/…`) o null: nunca se hace hotlinking al logo remoto. */
  logoLocal: string | null;
  enabled: boolean;
  halted: boolean;
  liquidityUsd: number | null;
  curated: boolean;
  /** Modo de horario xStocks (`TwentyFourFive` | `MarketHours` | `Regular`), o null si no hay dato. */
  mode: string | null;
  /** Período actual xStocks (`market` | `extended` | `overnight` | `closed`), o null. */
  period: string | null;
  /** true/false según `open_now`; null si no hay dato. */
  openNow: boolean | null;
  /** ISO de `next_change_at`, o null. */
  nextChangeAt: string | null;
  /** Mínimo/máximo por orden en USD (límites del período, centavos ÷ 100). Null si no hay dato. */
  minOrderUsd: number | null;
  maxOrderUsd: number | null;
  /** Estado de seguridad (M53). En el fallback sin Supabase, los curados son `listed`. */
  safetyStatus: SafetyStatus;
  /** Motivos de la auditoría (`safety_reasons`), vacíos si no hay dato. */
  safetyReasons: string[];
  /** Tier informativo de la auditoría (`safety_tier`), o null. */
  safetyTier: string | null;
  /** ISO de `safety_checked_at`, o null. */
  safetyCheckedAt: string | null;
  /**
   * Se puede operar (demo hoy, real después). Regla normal: `listed` +
   * habilitado + no suspendido. En transición (sin ningún `listed` en el
   * catálogo) los curados no ocultos también operan; en fallback, el snapshot.
   */
  tradable: boolean;
  /**
   * Va con el chip "En revisión": está en `watch` y la transición no lo
   * cubre (los curados en transición operan sin chip).
   */
  underReview: boolean;
  /**
   * La transición lo mantiene visible/operable aunque su estado sea
   * `unknown` (o `watch` curado). Se apaga sola al aparecer un `listed`.
   */
  transitionKept: boolean;
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
  issuer?: unknown;
  company_ticker?: unknown;
  logo_path?: unknown;
  enabled?: unknown;
  is_trading_halted?: unknown;
  jupiter_liquidity_usd?: unknown;
  curated?: unknown;
  trading_hours_mode?: unknown;
  current_period?: unknown;
  open_now?: unknown;
  next_change_at?: unknown;
  limits?: unknown;
  safety_status?: unknown;
  safety_reasons?: unknown;
  safety_tier?: unknown;
  safety_checked_at?: unknown;
  /** Tipo de producto de la auditoría (M52: `stock` | `etf` | `leveraged`), si la fila lo trae. */
  product_type?: unknown;
  safety_metrics?: unknown;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function categoryOf(value: unknown, row?: AssetRow): CatalogCategory {
  const raw = typeof value === "string" ? value.trim() : "";
  if ((KNOWN_CATEGORIES as readonly string[]).includes(raw)) return raw as CatalogCategory;
  // Activos nuevos sin categoría (M54): `etf` si el tipo de M52 es etf, si no `other`.
  const direct = typeof row?.product_type === "string" ? row.product_type.trim().toLowerCase() : "";
  if (direct === "etf") return "etf";
  if (direct !== "") return "other";
  if (productTypeFromMetrics(row?.safety_metrics) === "etf") return "etf";
  return "other";
}

/** El tipo de producto puede venir en `safety_metrics` (`product` o `product_type`). */
function productTypeFromMetrics(metrics: unknown): string | null {
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const table = metrics as Record<string, unknown>;
  for (const key of ["product", "product_type", "type"]) {
    const value = table[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim().toLowerCase();
  }
  return null;
}

/** Estado de seguridad normalizado: lo desconocido cae a `unknown` (conservador). */
export function normalizeSafetyStatus(value: unknown): SafetyStatus {
  return value === "listed" || value === "watch" || value === "hidden" ? value : "unknown";
}

function reasonsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Límites xStocks en centavos → USD. `limits` es `limitsPerPeriod` por período. */
function limitsUsdForPeriod(limits: unknown, period: string | null): { min: number | null; max: number | null } {
  if (limits === null || typeof limits !== "object" || Array.isArray(limits)) return { min: null, max: null };
  const table = limits as Record<string, unknown>;
  const keys = period ? [period, period.toLowerCase(), "market"] : ["market"];
  for (const key of keys) {
    const entry = table[key];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const minCents = numberOrNull(row.minOrderFiatValue);
    const maxCents = numberOrNull(row.maxOrderFiatValue);
    return {
      min: minCents !== null && minCents > 0 ? minCents / 100 : null,
      // `maxOrderFiatValue` 0 = no se puede operar en ese período: se conserva el 0.
      max: maxCents !== null && maxCents >= 0 ? maxCents / 100 : null,
    };
  }
  return { min: null, max: null };
}

function modeOrNull(value: unknown): string | null {
  return text(value);
}

function periodOrNull(value: unknown): string | null {
  return text(value);
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

/** Emisor normalizado: lo desconocido cae a `xstocks` (filas viejas). */
export function normalizeIssuer(value: unknown): AssetIssuer {
  return value === "ondo" ? "ondo" : "xstocks";
}

/** Costo de compra US$100 en bps desde `safety_metrics`, o null. */
function buy100CostFromMetrics(metrics: unknown): number | null {
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const table = metrics as Record<string, unknown>;
  for (const key of ["buy100_cost_bps", "buy100CostBps"]) {
    const parsed = numberOrNull(table[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function assetFromRow(row: AssetRow): CatalogAsset | null {
  const symbol = text(row.symbol);
  if (!symbol) return null;
  const name = text(row.name) ?? symbol;
  const underlying = text(row.underlying) ?? symbol.replace(/x$/i, "");
  const period = periodOrNull(row.current_period);
  const limits = limitsUsdForPeriod(row.limits, period);
  const safetyStatus = normalizeSafetyStatus(row.safety_status);
  const enabled = row.enabled !== false;
  const halted = row.is_trading_halted === true;
  return {
    symbol,
    name,
    underlying,
    category: categoryOf(row.category, row),
    mint: text(row.mint_solana) ?? "",
    issuer: normalizeIssuer(row.issuer),
    companyTicker: text(row.company_ticker) ?? underlying,
    buy100CostBps: buy100CostFromMetrics(row.safety_metrics),
    logoLocal: text(row.logo_path) ?? logoPathIfPresent(underlying, logoFileSet()),
    enabled,
    halted,
    liquidityUsd: numberOrNull(row.jupiter_liquidity_usd),
    curated: row.curated === true,
    mode: modeOrNull(row.trading_hours_mode),
    period,
    openNow: boolOrNull(row.open_now),
    nextChangeAt: isoOrNull(row.next_change_at),
    minOrderUsd: limits.min,
    maxOrderUsd: limits.max,
    safetyStatus,
    safetyReasons: reasonsOf(row.safety_reasons),
    safetyTier: text(row.safety_tier),
    safetyCheckedAt: isoOrNull(row.safety_checked_at),
    // Regla normal; `annotateSafety` aplica la transición con el catálogo completo.
    tradable: isTradableStatus(safetyStatus) && enabled && !halted,
    underReview: safetyStatus === "watch",
    transitionKept: false,
  };
}

export function assetFromTicker(ticker: Ticker, curated: boolean): CatalogAsset {
  return {
    symbol: ticker.symbol,
    name: ticker.name,
    underlying: ticker.underlying,
    category: ticker.category,
    mint: ticker.mint,
    issuer: "xstocks",
    companyTicker: ticker.underlying,
    buy100CostBps: null,
    logoLocal: ticker.logo,
    enabled: ticker.enabled,
    halted: false,
    liquidityUsd: null,
    curated,
    mode: null,
    period: null,
    openNow: null,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
    safetyStatus: "unknown",
    safetyReasons: [],
    safetyTier: null,
    safetyCheckedAt: null,
    tradable: false,
    underReview: false,
    transitionKept: false,
  };
}

/**
 * Transición obligatoria (M54, decisión de Manu): mientras el catálogo no
 * tenga NINGUNA fila `listed`, los curados del snapshot siguen visibles y
 * operables como hoy aunque su estado sea `unknown` o `watch` (sin chip),
 * salvo que estén `hidden`. Apenas existe un `listed`, rige la regla normal.
 * No usa `asset_safety_runs` (quedó una fila huérfana por un bug previo en
 * `scripts/audit-catalog.mjs`, anotado en PROGRESO.md). Pura: la usan los tests.
 */
export function isTransitionActive(
  rows: readonly Pick<CatalogAsset, "safetyStatus">[],
  fromSupabase: boolean,
): boolean {
  if (!fromSupabase || rows.length === 0) return false;
  return !rows.some((row) => row.safetyStatus === "listed");
}

/**
 * Aplica la regla de operación y el chip "En revisión" sobre filas ya
 * mapeadas. Un solo lugar: lo usan `search`/`bySymbol` y `tradable.ts`.
 */
export function annotateSafety(
  rows: readonly CatalogAsset[],
  fromSupabase: boolean,
): CatalogAsset[] {
  const transition = isTransitionActive(rows, fromSupabase);
  return rows.map((asset) => {
    if (asset.safetyStatus === "hidden") {
      return { ...asset, tradable: false, underReview: false, transitionKept: false };
    }
    if (transition && asset.curated) {
      const operable = asset.enabled && !asset.halted;
      return { ...asset, tradable: operable, underReview: false, transitionKept: operable };
    }
    // Ondo en watch: operables y sin chip (decisión de Manu, 2026-10-08).
    // No se marca `listed` en la base, así la transición de las curadas sigue.
    // Hidden, suspendidas y las xStocks en watch quedan como estaban.
    if (asset.issuer === "ondo" && asset.safetyStatus === "watch" && asset.enabled && !asset.halted) {
      return { ...asset, tradable: true, underReview: false, transitionKept: false };
    }
    return {
      ...asset,
      tradable: isTradableStatus(asset.safetyStatus) && asset.enabled && !asset.halted,
      underReview: asset.safetyStatus === "watch",
      transitionKept: false,
    };
  });
}

/** `hidden` no aparece nunca (M54). Pura: la usan los tests. */
export function isVisibleInScope(
  asset: Pick<CatalogAsset, "safetyStatus" | "curated" | "transitionKept"> & Partial<Pick<CatalogAsset, "issuer">>,
  scope: CatalogScope,
): boolean {
  if (asset.safetyStatus === "hidden") return false;
  if (scope === "curated") {
    if (asset.curated) return true;
    // La demo pública deja el alcance en `curated`. Las Ondo listas (watch o
    // listed) se ven igual. Una xStock que no es curada sigue afuera.
    return asset.issuer === "ondo" && (asset.safetyStatus === "watch" || asset.safetyStatus === "listed");
  }
  if (scope === "listed") {
    return asset.safetyStatus === "listed" || asset.safetyStatus === "watch" || asset.transitionKept;
  }
  return true;
}

/** `CATALOG_SCOPE` es el máximo permitido. Pura: la usan los tests. */
export function resolveEffectiveScope(requested: CatalogScope | undefined, maxScope: CatalogScope): CatalogScope {
  if (maxScope === "curated") return "curated";
  if (maxScope === "listed") return requested === "curated" ? "curated" : "listed";
  if (requested === "curated" || requested === "listed" || requested === "all") return requested;
  return "listed";
}

let warnedAllScopeInProd = false;

export function maxScopeFromEnv(): CatalogScope {
  const configured = serverEnv.CATALOG_SCOPE;
  if (configured === "curated") return "curated";
  if (configured === "all") {
    // `all` queda sólo para desarrollo (M54): en producción se ignora.
    if (process.env.NODE_ENV === "production") {
      if (!warnedAllScopeInProd) {
        warnedAllScopeInProd = true;
        console.warn("[catalog] CATALOG_SCOPE=all se ignora en producción: se usa listed.");
      }
      return "listed";
    }
    return "all";
  }
  return "listed";
}

/** Sólo para tests: reinicia el aviso único de `all` en producción. */
export function __resetScopeWarningsForTests(): void {
  warnedAllScopeInProd = false;
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
    // La ficha muestra el emisor como texto discreto (M52b): xStocks conserva
    // su nombre legal "Backed (xStocks)"; Ondo muestra "Ondo".
    issuer: asset.issuer === "ondo" ? "Ondo" : "Backed (xStocks)",
    category: asset.category,
    logo: asset.logoLocal ?? "",
    enabled: asset.enabled,
  };
}

/** Candidata a ficha de una empresa (un emisor). Pura: la usan los tests. */
export interface ListingCandidate {
  asset: CatalogAsset;
  companyTicker: string;
  buy100CostBps: number | null;
  volumeWinner: "xstocks" | "ondo" | null;
}

function listingStatusRank(status: SafetyStatus): number {
  if (status === "listed") return 0;
  if (status === "watch") return 1;
  return 2;
}

/**
 * Una ficha por empresa (M52b). Agrupa por `company_ticker` y elige en orden:
 * 1) la fila `tradable`, 2) la visible (`listed` antes que `watch`), 3) la de
 * menor costo de compra US$100 de la última corrida, 4) el ganador por volumen
 * del CSV (sólo desempata). Así, mientras el Ondo no esté `listed`, una empresa
 * curada sigue mostrando y operando su xStocks. Pura: la usan los tests.
 */
export function pickListingPerCompany(candidates: readonly ListingCandidate[]): CatalogAsset[] {
  const groups = new Map<string, ListingCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.companyTicker.trim() || candidate.asset.symbol;
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }
  const chosen: CatalogAsset[] = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => {
      if (a.asset.tradable !== b.asset.tradable) return a.asset.tradable ? -1 : 1;
      // Si las dos se pueden comprar, la curada (xStocks) sigue siendo la ficha.
      if (a.asset.curated !== b.asset.curated) return a.asset.curated ? -1 : 1;
      const status = listingStatusRank(a.asset.safetyStatus) - listingStatusRank(b.asset.safetyStatus);
      if (status !== 0) return status;
      const costA = a.buy100CostBps;
      const costB = b.buy100CostBps;
      if (costA !== null || costB !== null) {
        if (costA === null) return 1;
        if (costB === null) return -1;
        if (costA !== costB) return costA - costB;
      }
      const winA = a.volumeWinner !== null && a.asset.issuer === a.volumeWinner ? 0 : 1;
      const winB = b.volumeWinner !== null && b.asset.issuer === b.volumeWinner ? 0 : 1;
      if (winA !== winB) return winA - winB;
      if (a.asset.symbol < b.asset.symbol) return -1;
      if (a.asset.symbol > b.asset.symbol) return 1;
      return 0;
    });
    const first = ordered[0];
    if (first) chosen.push(first.asset);
  }
  chosen.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return chosen;
}

/** Ganador por volumen del CSV por `company_ticker` (sólo desempate). */
const volumeWinnerByCompanyCache = new Map<string, "xstocks" | "ondo">();

function volumeWinnerByCompany(): Map<string, "xstocks" | "ondo"> {
  if (volumeWinnerByCompanyCache.size === 0) {
    for (const entry of ONDO_TICKERS) {
      if (entry.volumeWinner !== null) volumeWinnerByCompanyCache.set(entry.ticker, entry.volumeWinner);
    }
  }
  return volumeWinnerByCompanyCache;
}

/**
 * Filtra por alcance y deja una ficha por empresa. `hidden` no aparece nunca.
 * Pura sobre filas ya anotadas: la usan `searchCatalog`/`bySymbol`.
 */
export function applyListing(rows: readonly CatalogAsset[], scope: CatalogScope): CatalogAsset[] {
  const winners = volumeWinnerByCompany();
  const visible = rows.filter(
    (asset) => asset.safetyStatus !== "hidden" && isVisibleInScope(asset, scope),
  );
  return pickListingPerCompany(
    visible.map((asset) => ({
      asset,
      companyTicker: asset.companyTicker,
      buy100CostBps: asset.buy100CostBps,
      volumeWinner: winners.get(asset.companyTicker) ?? null,
    })),
  );
}

function normalizePage(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || (value ?? 0) < 1) return fallback;
  return value as number;
}

function byName(a: CatalogAsset, b: CatalogAsset): number {
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.symbol.localeCompare(b.symbol);
}

function byLiquidity(a: CatalogAsset, b: CatalogAsset): number {
  const left = a.liquidityUsd ?? -1;
  const right = b.liquidityUsd ?? -1;
  return right - left || a.symbol.localeCompare(b.symbol);
}

/**
 * Sin texto de búsqueda, ordenar sólo por liquidez esconde el catálogo nuevo:
 * las Ondo no traen liquidez y quedan detrás de las xStocks que sí tienen.
 * Se alternan en todo el listado, empezando por un nombre nuevo, para que
 * cada página las muestre y no sólo un bloque al final de la primera.
 * Con búsqueda, o si ya entrarían en esa página, el orden de liquidez no cambia.
 */
function browseOrder(
  rows: readonly CatalogAsset[],
  sort: CatalogSort,
  needle: string,
  pageSize: number,
): CatalogAsset[] {
  if (sort === "name") return [...rows].sort(byName);
  const ranked = [...rows].sort(byLiquidity);
  if (needle || pageSize < 2) return ranked;
  const withLiquidity: CatalogAsset[] = [];
  const withoutLiquidity: CatalogAsset[] = [];
  for (const asset of ranked) {
    if (asset.liquidityUsd === null) withoutLiquidity.push(asset);
    else withLiquidity.push(asset);
  }
  if (withoutLiquidity.length === 0 || withLiquidity.length < pageSize) return ranked;
  const mixed: CatalogAsset[] = [];
  const count = Math.max(withLiquidity.length, withoutLiquidity.length);
  for (let index = 0; index < count; index += 1) {
    const fresh = withoutLiquidity[index];
    const liquid = withLiquidity[index];
    if (fresh) mixed.push(fresh);
    if (liquid) mixed.push(liquid);
  }
  return mixed;
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
    if (!isVisibleInScope(asset, effectiveScope)) return false;
    if (category !== "all" && category !== "" && asset.category !== category) return false;
    if (!needle) return true;
    return (
      fold(asset.symbol).includes(needle) ||
      fold(asset.underlying).includes(needle) ||
      fold(asset.name).includes(needle)
    );
  });

  const ordered = browseOrder(filtered, sort, needle, pageSize);

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
let catalogInflight: { fetchImpl: typeof fetch; job: Promise<LoadedAssets> } | null = null;
let listedProbe: { at: number; exists: boolean } | null = null;
let listedInflight: Promise<boolean> | null = null;

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
  catalogInflight = null;
  listedProbe = null;
  listedInflight = null;
}

const ASSETS_COLUMNS = [
  "symbol",
  "name",
  "underlying",
  "category",
  "mint_solana",
  "issuer",
  "company_ticker",
  "logo_path",
  "enabled",
  "is_trading_halted",
  "jupiter_liquidity_usd",
  "curated",
  "trading_hours_mode",
  "current_period",
  "open_now",
  "next_change_at",
  "limits",
  "safety_status",
  "safety_reasons",
  "safety_tier",
  "safety_checked_at",
].join(",");

/**
 * Columnas sin 0022 (compatibilidad): si la base todavía no tiene
 * `issuer`/`company_ticker`, el select completo falla y se reintenta con este.
 */
const ASSETS_COLUMNS_LEGACY = [
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
  "trading_hours_mode",
  "current_period",
  "open_now",
  "next_change_at",
  "limits",
  "safety_status",
  "safety_reasons",
  "safety_tier",
  "safety_checked_at",
].join(",");

function catalogSignal(): AbortSignal {
  return AbortSignal.timeout(CATALOG_FETCH_MS);
}

/** Valor de filtro PostgREST. Comillas si hay punto u otro carácter reservado (`BRK.B`). */
function eqFilter(value: string): string {
  const clean = value.replaceAll('"', "");
  if (/[^A-Za-z0-9]/.test(clean)) return `eq."${clean}"`;
  return `eq.${clean}`;
}

function rowsFromBody(body: unknown): CatalogAsset[] | null {
  if (!Array.isArray(body)) return null;
  const collected: CatalogAsset[] = [];
  for (const entry of body) {
    if (entry !== null && typeof entry === "object") {
      const asset = assetFromRow(entry as AssetRow);
      if (asset) collected.push(asset);
    }
  }
  return collected;
}

/**
 * Una página de `public.assets`. `status` 0 es red o abort (no se reintenta
 * como esquema viejo). El select caliente no pide `safety_metrics`.
 */
async function readAssetPage(
  fetchImpl: typeof fetch,
  columns: string,
  extra: Record<string, string>,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const config = readSupabasePublicConfig();
  if (!config) return { ok: false, status: 0 };
  const url = new URL(`${config.url}/rest/v1/assets`);
  url.searchParams.set("select", columns);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: config.publishableKey,
        authorization: `Bearer ${config.publishableKey}`,
      },
      cache: "no-store",
      signal: catalogSignal(),
    });
    if (!response.ok) return { ok: false, status: response.status };
    try {
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, status: response.status };
    }
  } catch {
    return { ok: false, status: 0 };
  }
}

async function fetchFilteredAssets(
  fetchImpl: typeof fetch,
  filters: Record<string, string>,
  limit: number,
): Promise<CatalogAsset[] | null> {
  if (!readSupabasePublicConfig()) return null;
  let columns = ASSETS_COLUMNS;
  let legacyTried = false;
  for (;;) {
    const result = await readAssetPage(fetchImpl, columns, { ...filters, limit: String(limit) });
    if (!result.ok) {
      if (!legacyTried && result.status !== 0 && columns !== ASSETS_COLUMNS_LEGACY) {
        legacyTried = true;
        columns = ASSETS_COLUMNS_LEGACY;
        continue;
      }
      return null;
    }
    return rowsFromBody(result.body);
  }
}

async function fetchAssetsFromSupabase(fetchImpl: typeof fetch): Promise<CatalogAsset[] | null> {
  const config = readSupabasePublicConfig();
  if (!config) return null;
  const collected: CatalogAsset[] = [];
  // Columnas 0022 primero; si la base aún no las tiene, reintento legacy.
  let columns = ASSETS_COLUMNS;
  let legacyTried = false;
  for (let page = 0; page < ASSETS_MAX_PAGES; page += 1) {
    const result = await readAssetPage(fetchImpl, columns, {
      // Orden estable: las filas curadas primero y el resto por símbolo.
      order: "curated.desc,symbol.asc",
      limit: String(ASSETS_PAGE_SIZE),
      offset: String(page * ASSETS_PAGE_SIZE),
    });
    if (!result.ok) {
      if (!legacyTried && columns !== ASSETS_COLUMNS_LEGACY && result.status !== 0) {
        legacyTried = true;
        columns = ASSETS_COLUMNS_LEGACY;
        page -= 1;
        continue;
      }
      // Sin ninguna fila, se mantiene el fallback actual; con filas parciales
      // se usan las obtenidas para no dejar el mercado vacío.
      return collected.length > 0 ? collected : null;
    }
    const rows = rowsFromBody(result.body);
    if (!rows) return collected.length > 0 ? collected : null;
    collected.push(...rows);
    // Página no llena: era la última.
    if (!Array.isArray(result.body) || result.body.length < ASSETS_PAGE_SIZE) break;
  }
  return collected;
}

function fallbackAssets(): CatalogAsset[] {
  // Sin Supabase (tests, e2e mock) el catálogo es el snapshot
  // `config/tickers.generated.ts`: los curados habilitados operan (M54).
  return TICKERS.map((ticker) => {
    const asset = assetFromTicker(ticker, true);
    if (!asset.enabled || asset.halted) {
      return { ...asset, safetyStatus: "unknown" as SafetyStatus };
    }
    return { ...asset, safetyStatus: "listed" as SafetyStatus, tradable: true };
  });
}

interface LoadedAssets {
  rows: CatalogAsset[];
  fromSupabase: boolean;
}

async function storeAssets(fetchImpl: typeof fetch, now: number): Promise<LoadedAssets> {
  const rows = await fetchAssetsFromSupabase(fetchImpl);
  if (rows === null) {
    const fallback = fallbackAssets();
    cache = { at: now, rows: fallback, fromSupabase: false };
    return { rows: fallback, fromSupabase: false };
  }
  const annotated = annotateSafety(rows, true);
  cache = { at: now, rows: annotated, fromSupabase: true };
  listedProbe = { at: now, exists: annotated.some((asset) => asset.safetyStatus === "listed") };
  return { rows: annotated, fromSupabase: true };
}

/**
 * Una sola descarga en vuelo por `fetch`. La memoria de 5 min cubre el resto.
 * `cache()` de React deduplica la variante sin deps dentro del request.
 */
async function loadAssets(fetchImpl: typeof fetch, now: number): Promise<LoadedAssets> {
  if (isFresh(now) && cache) return { rows: cache.rows, fromSupabase: cache.fromSupabase };
  if (catalogInflight && catalogInflight.fetchImpl === fetchImpl) return catalogInflight.job;
  const job = storeAssets(fetchImpl, now);
  catalogInflight = { fetchImpl, job };
  try {
    return await job;
  } finally {
    if (catalogInflight?.job === job) catalogInflight = null;
  }
}

const loadAssetsForRequest = cache(async () => loadAssets(fetch, Date.now()));

/**
 * Salvaguarda: si Supabase responde filas pero el alcance efectivo queda
 * vacío (sync incompleto: sin curadas en `curated`, o sin nada visible en
 * `listed` mientras la auditoría no lista), se usa el fallback de
 * `config/tickers.ts` para que el mercado nunca quede vacío. No se cachea el
 * reemplazo: el cache guarda las filas de Supabase para otros alcances.
 */
function withCuratedSafeguard(loaded: LoadedAssets, effectiveScope: CatalogScope): CatalogAsset[] {
  if (!loaded.fromSupabase || loaded.rows.length === 0) return loaded.rows;
  if (effectiveScope === "curated" && !loaded.rows.some((asset) => asset.curated)) {
    return fallbackAssets();
  }
  if (effectiveScope === "listed" && !loaded.rows.some((asset) => isVisibleInScope(asset, "listed"))) {
    return fallbackAssets();
  }
  return loaded.rows;
}

async function readLoaded(
  fetchImpl: typeof fetch | undefined,
  nowFn: (() => number) | undefined,
): Promise<LoadedAssets> {
  const now = nowFn?.() ?? Date.now();
  if (isFresh(now) && cache) return { rows: cache.rows, fromSupabase: cache.fromSupabase };
  if (fetchImpl || nowFn) return loadAssets(fetchImpl ?? fetch, now);
  return loadAssetsForRequest();
}

export async function searchCatalog(
  params: CatalogSearchParams,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<CatalogSearchResult> {
  const loaded = await readLoaded(deps?.fetchImpl, deps?.now);
  const effectiveScope = resolveEffectiveScope(params.scope, maxScopeFromEnv());
  // Una ficha por empresa (M52b): el total del mercado cuenta empresas.
  const listed = applyListing(withCuratedSafeguard(loaded, effectiveScope), effectiveScope);
  return searchAssets(listed, params);
}

type SymbolLookup = {
  scope?: CatalogScope;
  fetchImpl?: typeof fetch;
  now?: () => number;
  allowHidden?: boolean;
  noListing?: boolean;
};

function findInRows(rows: readonly CatalogAsset[], symbol: string, deps?: SymbolLookup): CatalogAsset | null {
  const wanted = symbol.trim().toLowerCase();
  if (!wanted) return null;
  const effectiveScope = resolveEffectiveScope(deps?.scope, maxScopeFromEnv());
  const exact = rows.find((asset) => asset.symbol.toLowerCase() === wanted);
  if (!exact) return null;
  // `hidden` no aparece (sólo la allowlist de operaciones lo consulta con `allowHidden`).
  if (exact.safetyStatus === "hidden" && !deps?.allowHidden) return null;
  if (!deps?.allowHidden && !isVisibleInScope(exact, effectiveScope)) return null;
  // Una ficha por empresa (M52b): el símbolo no elegido devuelve la ficha
  // elegida (la página redirige a ella). `noListing` conserva la fila exacta
  // (puerta de operaciones: el mint cotizado es el pedido, sin cambios).
  if (!deps?.allowHidden && !deps?.noListing) {
    const chosen = applyListing(rows, effectiveScope).find(
      (asset) => asset.companyTicker === exact.companyTicker,
    );
    if (chosen) return chosen;
  }
  return exact;
}

/**
 * La transición (ningún `listed` en la tabla) no se puede ver en una sola fila.
 * Si ya hay un `listed` en algún lado, se inyecta una fila sonda para que
 * `annotateSafety` no encienda la transición con el grupo de la empresa.
 */
function annotateGroup(rows: readonly CatalogAsset[], anyListed: boolean): CatalogAsset[] {
  if (rows.length === 0) return [];
  if (!anyListed) return annotateSafety(rows, true);
  const probe: CatalogAsset = {
    ...rows[0],
    symbol: "\u0000",
    safetyStatus: "listed",
    curated: false,
    issuer: "xstocks",
  };
  return annotateSafety([probe, ...rows], true).filter((asset) => asset.symbol !== "\u0000");
}

async function hasListedRow(fetchImpl: typeof fetch, now: number): Promise<boolean> {
  if (cache && isFresh(now) && cache.fromSupabase) {
    return cache.rows.some((asset) => asset.safetyStatus === "listed");
  }
  if (listedProbe && now - listedProbe.at < CATALOG_CACHE_MS) return listedProbe.exists;
  if (listedInflight) return listedInflight;
  const job = (async () => {
    const rows = await fetchFilteredAssets(fetchImpl, { safety_status: "eq.listed" }, 1);
    if (rows === null) return false;
    const exists = rows.length > 0;
    listedProbe = { at: now, exists };
    return exists;
  })();
  listedInflight = job;
  void job.finally(() => {
    if (listedInflight === job) listedInflight = null;
  });
  return job;
}

/**
 * Una fila por la PK `symbol` (`limit=1`). Si hace falta la ficha de la
 * empresa, los pares por `company_ticker`. No pagina la tabla.
 * Si la red falla, el snapshot local: no se descarga `assets` entero.
 */
async function findAssetByPrimaryKey(
  symbol: string,
  fetchImpl: typeof fetch,
  now: number,
  deps?: SymbolLookup,
): Promise<CatalogAsset | null> {
  const trimmed = symbol.trim();
  if (!trimmed) return null;
  const [primary, anyListed] = await Promise.all([
    fetchFilteredAssets(fetchImpl, { symbol: eqFilter(trimmed) }, 1),
    hasListedRow(fetchImpl, now),
  ]);
  if (primary === null) {
    const fallback = annotateSafety(fallbackAssets(), false);
    return findInRows(fallback, trimmed, deps);
  }
  const exact = primary.find((asset) => asset.symbol.toLowerCase() === trimmed.toLowerCase()) ?? null;
  if (!exact) return null;
  let group = [exact];
  if (!deps?.allowHidden && !deps?.noListing && exact.companyTicker.trim()) {
    const peers = await fetchFilteredAssets(
      fetchImpl,
      { company_ticker: eqFilter(exact.companyTicker) },
      8,
    );
    if (peers && peers.length > 0) {
      group = peers.some((asset) => asset.symbol.toLowerCase() === exact.symbol.toLowerCase())
        ? peers
        : [exact, ...peers];
    }
  }
  return findInRows(annotateGroup(group, anyListed), trimmed, deps);
}

async function findAssetBySymbolImpl(symbol: string, deps?: SymbolLookup): Promise<CatalogAsset | null> {
  const wanted = symbol.trim();
  if (!wanted) return null;
  const now = deps?.now?.() ?? Date.now();
  const fetchImpl = deps?.fetchImpl ?? fetch;
  if (isFresh(now) && cache) {
    const scope = resolveEffectiveScope(deps?.scope, maxScopeFromEnv());
    return findInRows(withCuratedSafeguard({ rows: cache.rows, fromSupabase: cache.fromSupabase }, scope), wanted, deps);
  }
  if (!readSupabasePublicConfig()) {
    const loaded = await loadAssets(fetchImpl, now);
    const scope = resolveEffectiveScope(deps?.scope, maxScopeFromEnv());
    return findInRows(withCuratedSafeguard(loaded, scope), wanted, deps);
  }
  return findAssetByPrimaryKey(wanted, fetchImpl, now, deps);
}

const findAssetForRequest = cache((symbol: string, scope: string, flags: string) =>
  findAssetBySymbolImpl(symbol, {
    scope: scope === "" ? undefined : (scope as CatalogScope),
    allowHidden: flags.includes("h"),
    noListing: flags.includes("n"),
  }),
);

export async function findAssetBySymbol(symbol: string, deps?: SymbolLookup): Promise<CatalogAsset | null> {
  const now = deps?.now?.() ?? Date.now();
  // Memoria fresca primero: los tests siembran el cache y React `cache()`
  // no debe devolver un resultado de otro request.
  if (!deps?.fetchImpl && isFresh(now) && cache) {
    const scope = resolveEffectiveScope(deps?.scope, maxScopeFromEnv());
    return findInRows(withCuratedSafeguard({ rows: cache.rows, fromSupabase: cache.fromSupabase }, scope), symbol, deps);
  }
  if (deps?.fetchImpl || deps?.now) return findAssetBySymbolImpl(symbol, deps);
  const flags = `${deps?.allowHidden ? "h" : ""}${deps?.noListing ? "n" : ""}`;
  // La PK `symbol` distingue mayúsculas (`NFLXx`). No normalizar antes del `eq`.
  return findAssetForRequest(symbol.trim(), deps?.scope ?? "", flags);
}

/** Activo por mint de Solana (allowlist dinámica, M54). `hidden` nunca se devuelve. */
export async function findAssetByMint(
  mint: string,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<CatalogAsset | null> {
  const wanted = mint.trim();
  if (!wanted) return null;
  const loaded = await readLoaded(deps?.fetchImpl, deps?.now);
  const exact = loaded.rows.find((asset) => asset.mint === wanted);
  if (!exact || exact.safetyStatus === "hidden") return null;
  return exact;
}
