import { tickerBySymbol } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { findAssetBySymbol, toTicker } from "@/lib/catalog/assets";
import { parseJupiterPrices } from "@/lib/market/live-quotes";
import { roundDigits } from "@/lib/mocks/number";
import { quoteFor } from "@/lib/mocks/prices";
import type { Quote, Ticker } from "@/lib/types";

/**
 * Precios en lote (M38). Agrupa mints en lotes de hasta 50 (límite de
 * Jupiter Price v3), junta pedidos iguales en vuelo, guarda cada mint 5 s y,
 * ante un 429 o un error, devuelve el último valor guardado marcado `stale`
 * (o la referencia si nunca hubo precio). Reintenta con espera (backoff).
 * `usdPrice` de Jupiter ya es precio por acción: no se divide (regla M34).
 */

export const PRICE_BATCH_MAX_IDS = 50;
export const PRICE_BATCH_TTL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 2_500;
const DEFAULT_BACKOFF_MS = [250, 800] as const;

export interface MintPrice {
  usdPrice: number;
  changeRatio: number;
  /**
   * false si Jupiter no mandó `priceChange24h`. En ese caso el último canje
   * queda quieto y el precio que se mueve es el del subyacente.
   */
  changeKnown?: boolean;
  liquidityUsd?: number;
  marketPriceUsd?: number;
}

export interface BatchedMintPrice extends MintPrice {
  stale: boolean;
}

interface MintCacheEntry extends MintPrice {
  at: number;
}

/** Precio que ve la pantalla. Sin variación del pozo, sigue el subyacente. */
export function shownMintPrice(row: Pick<MintPrice, "usdPrice" | "marketPriceUsd" | "changeKnown">): number {
  if (row.changeKnown === false && row.marketPriceUsd !== undefined && row.marketPriceUsd > 0) {
    return row.marketPriceUsd;
  }
  return row.usdPrice;
}

export interface PriceBatcherCache {
  entries: Map<string, MintCacheEntry>;
  inflight: Map<string, Promise<Map<string, MintPrice>>>;
}

export function createPriceBatcherCache(): PriceBatcherCache {
  return { entries: new Map(), inflight: new Map() };
}

export interface MintBatchOptions {
  priceUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cache?: PriceBatcherCache;
  now?: () => number;
  /** Espera entre reintentos. En tests se inyecta una que no espera. */
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: readonly number[];
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkKey(mints: readonly string[]): string {
  return [...mints].sort().join(",");
}

async function fetchChunkOnce(mints: readonly string[], options: MintBatchOptions): Promise<Map<string, MintPrice>> {
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
    if (response.status === 429) throw new Error("jupiter 429");
    if (!response.ok) throw new Error(`jupiter ${response.status}`);
    return parseJupiterPrices(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchChunkWithRetry(
  mints: readonly string[],
  options: MintBatchOptions,
): Promise<Map<string, MintPrice>> {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= backoff.length; attempt += 1) {
    try {
      return await fetchChunkOnce(mints, options);
    } catch (error) {
      lastError = error;
      const wait = backoff[attempt];
      if (wait === undefined) break;
      await sleep(wait);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("jupiter");
}

/**
 * Precios por mint. Los frescos (< 15 s) no tocan la red. Los demás se piden
 * en lotes de 50; dos llamadas iguales en vuelo comparten la misma promesa.
 * Si un lote falla tras los reintentos, cada mint vuelve al último valor
 * guardado (`stale: true`) o queda ausente (el caller usa la referencia).
 */
export async function fetchMintBatch(
  mints: readonly string[],
  options: MintBatchOptions,
): Promise<Map<string, BatchedMintPrice>> {
  const cache = options.cache ?? createPriceBatcherCache();
  const now = options.now?.() ?? Date.now();
  const unique = [...new Set(mints.map((mint) => mint.trim()).filter((mint) => mint.length > 0))];
  const out = new Map<string, BatchedMintPrice>();
  const pending: string[] = [];
  for (const mint of unique) {
    const hit = cache.entries.get(mint);
    if (hit && now - hit.at < PRICE_BATCH_TTL_MS) {
      out.set(mint, {
        usdPrice: hit.usdPrice,
        changeRatio: hit.changeRatio,
        stale: false,
        ...(hit.changeKnown !== undefined ? { changeKnown: hit.changeKnown } : {}),
        ...(hit.liquidityUsd !== undefined ? { liquidityUsd: hit.liquidityUsd } : {}),
        ...(hit.marketPriceUsd !== undefined ? { marketPriceUsd: hit.marketPriceUsd } : {}),
      });
    } else {
      pending.push(mint);
    }
  }
  for (let index = 0; index < pending.length; index += PRICE_BATCH_MAX_IDS) {
    const chunk = pending.slice(index, index + PRICE_BATCH_MAX_IDS);
    const key = chunkKey(chunk);
    let job = cache.inflight.get(key);
    if (!job) {
      job = fetchChunkWithRetry(chunk, options);
      cache.inflight.set(key, job);
      const cleanup = () => {
        if (cache.inflight.get(key) === job) cache.inflight.delete(key);
      };
      void job.then(cleanup, cleanup);
    }
    let rows: Map<string, MintPrice> | null = null;
    try {
      rows = await job;
    } catch {
      rows = null;
    }
    for (const mint of chunk) {
      const row = rows?.get(mint);
      if (row) {
        cache.entries.set(mint, {
          at: now,
          usdPrice: row.usdPrice,
          changeRatio: row.changeRatio,
          ...(row.changeKnown !== undefined ? { changeKnown: row.changeKnown } : {}),
          ...(row.liquidityUsd !== undefined ? { liquidityUsd: row.liquidityUsd } : {}),
          ...(row.marketPriceUsd !== undefined ? { marketPriceUsd: row.marketPriceUsd } : {}),
        });
        out.set(mint, { ...row, stale: false });
        continue;
      }
      const previous = cache.entries.get(mint);
      if (previous) {
        out.set(mint, {
          usdPrice: previous.usdPrice,
          changeRatio: previous.changeRatio,
          stale: true,
          ...(previous.changeKnown !== undefined ? { changeKnown: previous.changeKnown } : {}),
          ...(previous.liquidityUsd !== undefined ? { liquidityUsd: previous.liquidityUsd } : {}),
          ...(previous.marketPriceUsd !== undefined ? { marketPriceUsd: previous.marketPriceUsd } : {}),
        });
      }
    }
  }
  return out;
}

export interface BatchedQuoteOptions extends MintBatchOptions {
  multiplierOf?: (symbol: string) => number;
  prepareMultipliers?: (tickers: readonly Ticker[]) => Promise<ReadonlyMap<string, number>>;
  /**
   * Variación del día del subyacente, como ratio (0,012 = 1,2 %).
   * Sólo se pide cuando Jupiter no trajo `priceChange24h`. La clave es el
   * ticker de la acción (`AAL`), no el símbolo del catálogo (`AALon`).
   */
  underlyingChange?: (underlyings: readonly string[]) => Promise<ReadonlyMap<string, number>>;
}

async function resolveTickers(symbols: readonly string[]): Promise<Ticker[]> {
  const out: Ticker[] = [];
  for (const symbol of symbols) {
    const ticker = tickerBySymbol(symbol);
    if (ticker) {
      out.push(ticker);
      continue;
    }
    // Activos nuevos del catálogo (M54): el mint sale de la fila, no del snapshot.
    const asset = await findAssetBySymbol(symbol, { scope: "all" });
    if (!asset || !asset.mint) throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
    out.push(toTicker(asset));
  }
  return out;
}

/**
 * Cotizaciones por símbolo vía el batcher. Misma regla que M34: `usdPrice`
 * tal cual, `reference: true` con la ancla si el mint no trajo precio.
 * Si Jupiter no manda `priceChange24h`, el titular sigue el precio del
 * subyacente (`stockData.price`) y la variación la pone `underlyingChange`.
 * El valor `stale` avisa que el precio es el último guardado tras un 429/error.
 */
export async function listBatchedQuotes(
  symbols: readonly string[],
  options: BatchedQuoteOptions,
): Promise<Quote[]> {
  const tickers = await resolveTickers(symbols);
  const now = options.now?.() ?? Date.now();
  const multipliers = await (
    options.prepareMultipliers?.(tickers) ?? Promise.resolve(new Map<string, number>())
  ).catch(() => new Map<string, number>());
  const prices = await fetchMintBatch(
    tickers.map((ticker) => ticker.mint),
    options,
  );
  const missingChange = [
    ...new Set(
      tickers
        .filter((ticker) => {
          const row = prices.get(ticker.mint);
          return row?.changeKnown === false && ticker.underlying.trim().length > 0;
        })
        .map((ticker) => ticker.underlying),
    ),
  ];
  const moves =
    missingChange.length > 0 && options.underlyingChange
      ? await options.underlyingChange(missingChange).catch(() => new Map<string, number>())
      : new Map<string, number>();
  return tickers.map((ticker) => {
    const row = prices.get(ticker.mint);
    if (!row) return { ...quoteFor(ticker.symbol, now), reference: true };
    const multiplier = multipliers.get(ticker.symbol) ?? options.multiplierOf?.(ticker.symbol) ?? 1;
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    const priceUsd = roundDigits(shownMintPrice(row), 6);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      return { ...quoteFor(ticker.symbol, now), reference: true };
    }
    const fromUnderlying = row.changeKnown === false ? moves.get(ticker.underlying) : undefined;
    const changeRatio =
      fromUnderlying !== undefined && Number.isFinite(fromUnderlying) ? fromUnderlying : row.changeRatio;
    return {
      symbol: ticker.symbol,
      priceUsd,
      change24hPct: roundDigits(changeRatio, 6),
      multiplier: safeMultiplier,
      updatedAt: new Date(now).toISOString(),
      source: "jupiter" as const,
      ...(row.stale ? { stale: true } : {}),
      ...(row.marketPriceUsd !== undefined ? { marketPriceUsd: roundDigits(row.marketPriceUsd, 6) } : {}),
      ...(row.liquidityUsd !== undefined ? { liquidityUsd: roundDigits(row.liquidityUsd, 2) } : {}),
    };
  });
}
