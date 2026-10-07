import { ENABLED_TICKERS, tickerBySymbol } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { roundDigits } from "@/lib/mocks/number";
import { quoteFor } from "@/lib/mocks/prices";
import type { Quote, Ticker } from "@/lib/types";

/**
 * Precio actual vía Jupiter Price API v3.
 * GET {priceUrl}?ids={mints} — hasta 50 por llamada. `x-api-key` sólo si hay clave.
 * `usdPrice` ya es el precio por acción (equivale a `usdPricePrescaled` / multiplicador).
 * No se vuelve a dividir: si el RPC llega tarde el precio saltaría.
 * `priceChange24h` es un porcentaje (1,29 = +1,29 %). El multiplicador se guarda aparte.
 * Se descarta un precio que no es un número mayor que cero.
 * Si la red falla o falta el mint, la quote es la ancla mock con `reference: true`.
 * Este módulo no decide el flag: si nadie lo llama, no hay red.
 */

const DEFAULT_TIMEOUT_MS = 2_500;
const DEFAULT_CACHE_MS = 10_000;
const MAX_IDS = 50;

interface ParsedPrice {
  usdPrice: number;
  changeRatio: number;
  /** Liquidez del pozo en USD, si Jupiter la trae. */
  liquidityUsd?: number;
  /** Precio del subyacente (`stockData.price`), si Jupiter lo trae. */
  marketPriceUsd?: number;
}

interface CachedPrice extends ParsedPrice {
  at: number;
}

interface CachedMiss {
  at: number;
  miss: true;
}

type CacheEntry = CachedPrice | CachedMiss;

export interface LivePriceCache {
  entries: Map<string, CacheEntry>;
  failedAt: number;
  inflight: Promise<void> | null;
}

export interface LiveQuoteOptions {
  priceUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
  cache?: LivePriceCache;
  /** Si falta en el mapa, 1. Un valor que no es finito y mayor que cero también queda en 1. */
  multiplierOf?: (symbol: string) => number;
  /**
   * Corre en paralelo con Jupiter. Si rechaza o no alcanza, el multiplicador es 1.
   * La cache de precios no espera más que esta promesa.
   */
  prepareMultipliers?: (tickers: readonly Ticker[]) => Promise<ReadonlyMap<string, number>>;
}

export function createLivePriceCache(): LivePriceCache {
  return { entries: new Map(), failedAt: 0, inflight: null };
}

function resolveTickers(symbols: readonly string[]): Ticker[] {
  if (symbols.length === 0) return [...ENABLED_TICKERS];
  return symbols.map((symbol) => {
    const ticker = tickerBySymbol(symbol);
    if (!ticker) throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
    return ticker;
  });
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isPriceRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Sólo filas con `usdPrice` usable. El resto se trata como ticker ausente. */
export function parseJupiterPrices(body: unknown): Map<string, ParsedPrice> {
  const rows = new Map<string, ParsedPrice>();
  if (!isPriceRow(body)) return rows;
  for (const [mint, row] of Object.entries(body)) {
    if (!isPriceRow(row)) continue;
    const usdPrice = positiveNumber(row.usdPrice);
    if (usdPrice === null) continue;
    const changePct = finiteNumber(row.priceChange24h);
    const liquidityRaw = row.liquidity === undefined ? undefined : positiveNumber(row.liquidity);
    const stockData = isPriceRow(row.stockData) ? row.stockData : null;
    const marketRaw = stockData ? positiveNumber(stockData.price) : null;
    rows.set(mint, {
      usdPrice,
      changeRatio: changePct === null ? 0 : changePct / 100,
      ...(liquidityRaw !== undefined && liquidityRaw !== null ? { liquidityUsd: liquidityRaw } : {}),
      ...(marketRaw !== null ? { marketPriceUsd: marketRaw } : {}),
    });
  }
  return rows;
}

function isMiss(entry: CacheEntry): entry is CachedMiss {
  return "miss" in entry;
}

function isFresh(entry: CacheEntry | undefined, now: number, ttl: number): entry is CacheEntry {
  return entry !== undefined && now - entry.at < ttl;
}

function referenceQuote(symbol: string, now: number): Quote {
  return { ...quoteFor(symbol, now), reference: true };
}

function multiplierFor(
  symbol: string,
  multipliers: ReadonlyMap<string, number>,
  options: LiveQuoteOptions,
): number {
  const value = multipliers.get(symbol) ?? options.multiplierOf?.(symbol) ?? 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function toQuote(
  ticker: Ticker,
  cache: LivePriceCache,
  multipliers: ReadonlyMap<string, number>,
  now: number,
  ttl: number,
  options: LiveQuoteOptions,
): Quote {
  const entry = cache.entries.get(ticker.mint);
  if (!isFresh(entry, now, ttl) || isMiss(entry)) return referenceQuote(ticker.symbol, now);
  const multiplier = multiplierFor(ticker.symbol, multipliers, options);
  const priceUsd = roundDigits(entry.usdPrice, 6);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return referenceQuote(ticker.symbol, now);
  return {
    symbol: ticker.symbol,
    priceUsd: roundDigits(priceUsd, 6),
    change24hPct: roundDigits(entry.changeRatio, 6),
    multiplier,
    updatedAt: new Date(now).toISOString(),
    source: "jupiter",
    ...(entry.marketPriceUsd !== undefined ? { marketPriceUsd: roundDigits(entry.marketPriceUsd, 6) } : {}),
    ...(entry.liquidityUsd !== undefined ? { liquidityUsd: roundDigits(entry.liquidityUsd, 2) } : {}),
  };
}

async function fetchChunk(mints: readonly string[], options: LiveQuoteOptions): Promise<Map<string, ParsedPrice>> {
  const url = new URL(options.priceUrl);
  url.searchParams.set("ids", mints.join(","));
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = options.apiKey?.trim();
  if (apiKey) headers["x-api-key"] = apiKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`jupiter ${response.status}`);
    return parseJupiterPrices(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInto(
  cache: LivePriceCache,
  tickers: readonly Ticker[],
  options: LiveQuoteOptions,
  now: number,
): Promise<void> {
  const mints = [...new Set(tickers.map((ticker) => ticker.mint))];
  try {
    const rows = new Map<string, ParsedPrice>();
    for (let index = 0; index < mints.length; index += MAX_IDS) {
      const part = await fetchChunk(mints.slice(index, index + MAX_IDS), options);
      for (const [mint, row] of part) rows.set(mint, row);
    }
    for (const mint of mints) {
      const row = rows.get(mint);
      if (row) cache.entries.set(mint, { at: now, ...row });
      else cache.entries.set(mint, { at: now, miss: true });
    }
    cache.failedAt = 0;
  } catch {
    cache.failedAt = now;
  }
}

function isCooling(cache: LivePriceCache, now: number, ttl: number): boolean {
  return cache.failedAt > 0 && now - cache.failedAt < ttl;
}

async function ensureFresh(
  tickers: readonly Ticker[],
  options: LiveQuoteOptions,
  cache: LivePriceCache,
  now: number,
  ttl: number,
): Promise<void> {
  for (let pass = 0; pass < 2; pass += 1) {
    const need = tickers.filter((ticker) => !isFresh(cache.entries.get(ticker.mint), now, ttl));
    if (need.length === 0 || isCooling(cache, now, ttl)) return;
    if (cache.inflight) {
      await cache.inflight;
      continue;
    }
    const job = fetchInto(cache, need, options, now).finally(() => {
      cache.inflight = null;
    });
    cache.inflight = job;
    await job;
    return;
  }
}

export async function listLiveQuotes(symbols: readonly string[], options: LiveQuoteOptions): Promise<Quote[]> {
  const tickers = resolveTickers(symbols);
  const cache = options.cache ?? createLivePriceCache();
  const now = options.now?.() ?? Date.now();
  const ttl = options.cacheMs ?? DEFAULT_CACHE_MS;
  const multipliersPromise = (
    options.prepareMultipliers?.(tickers) ?? Promise.resolve(new Map<string, number>())
  ).catch(() => new Map<string, number>());
  const [multipliers] = await Promise.all([
    multipliersPromise,
    ensureFresh(tickers, options, cache, now, ttl),
  ]);
  return tickers.map((ticker) => toQuote(ticker, cache, multipliers, now, ttl, options));
}
