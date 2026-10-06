import "server-only";

import { MIN_TRADE_USD } from "@/config/trade";
import { findAssetBySymbol, type CatalogAsset } from "@/lib/catalog/assets";
import { serverEnv } from "@/lib/env";
import { mockMarketStatus } from "@/lib/mocks/market";

/**
 * Horario real por acción desde xStocks (M39).
 * Fuente: `GET /api/v2/public/assets/{symbol}` + `system/status/{symbol}`
 * (timeout 2,5 s, cache 60 s por símbolo). Si falla, el catálogo
 * (`public.assets`); si tampoco, el mock actual. Sólo con `PRICES_MODE=live`
 * o `MARKET_STATUS_MODE=live`; en mock sigue el mock.
 */

export type AssetTradingMode = "TwentyFourFive" | "MarketHours" | "Regular" | "unknown";
export type AssetPeriod = "market" | "extended" | "overnight" | "closed" | "unknown";
export type AssetStatusSource = "live" | "catalog" | "mock";

export interface AssetStatus {
  mode: AssetTradingMode;
  period: AssetPeriod;
  openNow: boolean;
  nextChangeAt: string | null;
  halted: boolean;
  minOrderUsd: number | null;
  maxOrderUsd: number | null;
  source: AssetStatusSource;
  updatedAt: string;
}

const XSTOCKS_BASE = "https://api.xstocks.fi/api/v2/public";
const TIMEOUT_MS = 2_500;
const CACHE_MS = 60_000;

/** Clave i18n del chip del detalle según el estado real. Pura: la usan los tests. */
export type AssetChipKey = "halted" | "market" | "extended" | "overnight" | "closed";

export function chipKeyForStatus(status: Pick<AssetStatus, "halted" | "period" | "openNow">): AssetChipKey {
  if (status.halted) return "halted";
  if (status.period === "market" && status.openNow) return "market";
  if (status.period === "extended") return "extended";
  if (status.period === "overnight") return "overnight";
  return "closed";
}

/** `halted` deshabilita la orden demo con ese motivo. Pura: la usan los tests. */
export function tradeBlockForStatus(status: Pick<AssetStatus, "halted">): "halted" | null {
  return status.halted ? "halted" : null;
}

/** Mínimo efectivo por orden: el del activo o US$1 si no hay dato. Pura. */
export function effectiveMinOrderUsd(minOrderUsd: number | null | undefined): number {
  return typeof minOrderUsd === "number" && Number.isFinite(minOrderUsd) && minOrderUsd > 0
    ? minOrderUsd
    : MIN_TRADE_USD;
}

export function isLiveStatusEnabled(): boolean {
  return serverEnv.PRICES_MODE === "live" || serverEnv.MARKET_STATUS_MODE === "live";
}

export function normalizeMode(value: unknown): AssetTradingMode {
  if (typeof value !== "string") return "unknown";
  const raw = String(value).trim();
  if (raw === "TwentyFourFive") return "TwentyFourFive";
  if (raw === "MarketHours") return "MarketHours";
  if (raw === "Regular") return "Regular";
  return "unknown";
}

export function normalizePeriod(value: unknown): AssetPeriod {
  if (typeof value !== "string") return "unknown";
  const raw = value.trim().toLowerCase();
  if (raw === "market" || raw === "regular" || raw === "open") return "market";
  if (raw === "extended" || raw === "premarket" || raw === "postmarket" || raw === "post" || raw === "pre")
    return "extended";
  if (raw === "overnight" || raw === "night") return "overnight";
  if (raw === "closed" || raw === "close") return "closed";
  return "unknown";
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isoOrNull(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

function openNowOrFallback(value: unknown, period: AssetPeriod): boolean {
  if (typeof value === "boolean") return value;
  if (period === "market" || period === "extended" || period === "overnight") return true;
  return false;
}

interface LiveParsed {
  mode: AssetTradingMode;
  period: AssetPeriod;
  openNow: boolean;
  nextChangeAt: string | null;
  halted: boolean;
  minOrderUsd: number | null;
  maxOrderUsd: number | null;
}

function limitsForPeriod(limits: unknown, period: AssetPeriod): { min: number | null; max: number | null } {
  if (limits === null || typeof limits !== "object" || Array.isArray(limits)) return { min: null, max: null };
  const table = limits as Record<string, unknown>;
  const candidates = [period, period.toLowerCase(), "market"];
  for (const key of candidates) {
    const entry = table[key];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const minCents = numberOrNull(row.minOrderFiatValue);
    const maxCents = numberOrNull(row.maxOrderFiatValue);
    return {
      min: minCents !== null && minCents > 0 ? minCents / 100 : null,
      max: maxCents !== null && maxCents >= 0 ? maxCents / 100 : null,
    };
  }
  return { min: null, max: null };
}

function parseAssetBody(body: unknown): Omit<LiveParsed, "halted"> & { haltedHint: boolean } {
  const node = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const trading =
    node.trading !== null && typeof node.trading === "object" && !Array.isArray(node.trading)
      ? (node.trading as Record<string, unknown>)
      : {};
  const mode = normalizeMode(trading.tradingHoursMode);
  const period = normalizePeriod(trading.currentPeriod);
  const haltedHint =
    (typeof node.isTradingHalted === "boolean" ? node.isTradingHalted : false) ||
    (typeof trading.isTradingHalted === "boolean" ? trading.isTradingHalted : false);
  const limits = limitsForPeriod(trading.limitsPerPeriod, period);
  return {
    mode,
    period,
    openNow: openNowOrFallback(trading.openNow, period),
    nextChangeAt: isoOrNull(trading.nextChangeAt),
    haltedHint,
    minOrderUsd: limits.min,
    maxOrderUsd: limits.max,
  };
}

function parseSystemBody(body: unknown): boolean {
  const node = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return (
    (typeof node.isMarketTradingHalted === "boolean" ? node.isMarketTradingHalted : false) ||
    (typeof node.isAtomicTradingHalted === "boolean" ? node.isAtomicTradingHalted : false)
  );
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`xstocks http ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readLive(symbol: string, fetchImpl: typeof fetch): Promise<LiveParsed> {
  const encoded = encodeURIComponent(symbol.trim());
  const [assetBody, systemBody] = await Promise.all([
    fetchJson(`${XSTOCKS_BASE}/assets/${encoded}`, fetchImpl),
    fetchJson(`${XSTOCKS_BASE}/system/status/${encoded}`, fetchImpl).catch(() => null),
  ]);
  const parsed = parseAssetBody(assetBody);
  const systemHalted = systemBody === null ? false : parseSystemBody(systemBody);
  return {
    mode: parsed.mode,
    period: parsed.period,
    openNow: parsed.openNow,
    nextChangeAt: parsed.nextChangeAt,
    halted: parsed.haltedHint || systemHalted,
    minOrderUsd: parsed.minOrderUsd,
    maxOrderUsd: parsed.maxOrderUsd,
  };
}

function fromCatalog(asset: CatalogAsset, nowIso: string): AssetStatus {
  return {
    mode: normalizeMode(asset.mode),
    period: normalizePeriod(asset.period),
    openNow:
      typeof asset.openNow === "boolean"
        ? asset.openNow
        : (() => {
            const period = normalizePeriod(asset.period);
            return period === "market" || period === "extended" || period === "overnight";
          })(),
    nextChangeAt: asset.nextChangeAt,
    halted: asset.halted,
    minOrderUsd: asset.minOrderUsd,
    maxOrderUsd: asset.maxOrderUsd,
    source: "catalog",
    updatedAt: nowIso,
  };
}

function fromMock(now: Date): AssetStatus {
  const mock = mockMarketStatus(now);
  const period: AssetPeriod =
    mock.session === "regular" ? "market" : mock.session === "offHours" ? "extended" : "closed";
  return {
    mode: "TwentyFourFive",
    period,
    openNow: mock.session !== "closed",
    nextChangeAt: mock.nextChange,
    halted: false,
    minOrderUsd: MIN_TRADE_USD,
    maxOrderUsd: null,
    source: "mock",
    updatedAt: now.toISOString(),
  };
}

const liveCache = new Map<string, { at: number; status: LiveParsed }>();

/** Sólo para tests. */
export function __clearAssetStatusCacheForTests(): void {
  liveCache.clear();
}

export interface AssetStatusDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  findAsset?: (symbol: string) => Promise<CatalogAsset | null>;
  /** Sólo tests: fuerza (`true`) u omite (`false`) la vía live sin depender del env. */
  live?: boolean;
}

export async function status(symbol: string, deps?: AssetStatusDeps): Promise<AssetStatus> {
  const wanted = symbol.trim();
  if (!wanted) throw new Error("symbol vacío");
  const nowMs = deps?.now?.() ?? Date.now();
  const now = new Date(nowMs);
  const nowIso = now.toISOString();
  const liveEnabled = deps?.live ?? isLiveStatusEnabled();

  if (liveEnabled) {
    const key = wanted.toLowerCase();
    const hit = liveCache.get(key);
    if (hit && nowMs - hit.at < CACHE_MS) {
      return { ...hit.status, source: "live", updatedAt: nowIso };
    }
    try {
      const live = await readLive(wanted, deps?.fetchImpl ?? fetch);
      liveCache.set(key, { at: nowMs, status: live });
      return { ...live, source: "live", updatedAt: nowIso };
    } catch {
      // Cae al catálogo y luego al mock.
    }
  }

  try {
    const asset = deps?.findAsset
      ? await deps.findAsset(wanted)
      : await findAssetBySymbol(wanted);
    if (asset) return fromCatalog(asset, nowIso);
  } catch {
    // Cae al mock.
  }
  return fromMock(now);
}
