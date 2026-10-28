/**
 * Corrida de los crons de `price_ticks` (y del script local).
 * Sin `server-only` y sin cliente de Supabase: quien llama lee y escribe.
 * Sólo entran números que Jupiter o CoinGecko devolvieron.
 */

import {
  coingeckoSymbol,
  fetchCoinGeckoHistory,
  resolveCoinGeckoIdMap,
  type CoinGeckoCallState,
} from "./coingecko-history";
import { fetchJupiterSpots, jupiterPriceUrl, JUPITER_BATCH, type JupiterCallState } from "./jupiter-spot";
import { safeJobError } from "./cron-safe";

export interface CronTick {
  symbol: string;
  t: number;
  priceUsd: number;
  source: "jupiter" | "coingecko";
}

export interface TickWriteResult {
  saved: number;
  error: string | null;
}

export interface JupiterTickJobResult {
  candidates: number;
  quoted: number;
  recorded: number;
  dbError: string | null;
  rateLimited: boolean;
}

export interface CoinGeckoBackfillResult {
  backfilled: number;
  pending: number;
  points: number;
  noId: number;
  rateLimited: boolean;
  dbError: string | null;
  remaining: number;
  idMap: number;
}

interface SpotAsset {
  symbol: string;
  mint: string;
}

export interface JupiterTickJobInput {
  assets: readonly SpotAsset[];
  fetchImpl?: typeof fetch;
  /** Base (`https://api.jup.ag`) o URL ya terminada en `/price/v3`. */
  priceUrl: string;
  apiKey?: string;
  /** Instante del tick. Por defecto `Date.now()`. */
  now?: number;
  /** No empieza otro lote si el reloj pasó este instante. */
  deadline?: number;
  clock?: () => number;
  write: (ticks: readonly CronTick[]) => Promise<TickWriteResult>;
}

export interface CoinGeckoBackfillInput {
  assets: readonly { symbol: string }[];
  fetchImpl?: typeof fetch;
  apiKey?: string;
  days?: number;
  /** Tope de símbolos nuevos en esta corrida. */
  cap?: number;
  /** Pausa entre gráficos. 0 en tests. */
  paceMs?: number;
  /** No empieza un gráfico si no queda este margen (el cuerpo es grande). */
  chartGuardMs?: number;
  deadline?: number;
  clock?: () => number;
  timeoutMs?: number;
  /** Reintentos del mapa ante 429. El cron diario usa 1; los tests, 0. */
  idMapRetries?: number;
  /** Reintentos de cada gráfico ante 429. El cron deja 0. */
  retry429?: number;
  sleep?: (ms: number) => Promise<void>;
  hasHistory: (symbols: readonly string[]) => Promise<ReadonlySet<string>>;
  write: (ticks: readonly CronTick[]) => Promise<TickWriteResult>;
}

const HISTORY_SLICE = 40;
const DEFAULT_CHART_GUARD_MS = 14_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function floorMinute(now: number): number {
  return Math.floor(now / 60_000) * 60_000;
}

/** Spot de Jupiter, un lote por escritura, para no perder lo ya pedido si se corta el tiempo. */
export async function runJupiterTickJob(input: JupiterTickJobInput): Promise<JupiterTickJobResult> {
  const tickAt = floorMinute(input.now ?? Date.now());
  const clock = input.clock ?? Date.now;
  const state: JupiterCallState = { rateLimited: false };
  const priceUrl = jupiterPriceUrl(input.priceUrl);
  let quoted = 0;
  let recorded = 0;
  let dbError: string | null = null;
  for (let index = 0; index < input.assets.length; index += JUPITER_BATCH) {
    if (state.rateLimited) break;
    if (input.deadline !== undefined && clock() >= input.deadline) break;
    const chunk = input.assets.slice(index, index + JUPITER_BATCH);
    let spots;
    try {
      spots = await fetchJupiterSpots(chunk, {
        fetchImpl: input.fetchImpl,
        priceUrl: state.priceUrl ?? priceUrl,
        apiKey: input.apiKey,
        deadline: input.deadline,
        now: clock,
        state,
      });
    } catch (error) {
      dbError = safeJobError(error);
      break;
    }
    const ticks: CronTick[] = [];
    for (const spot of spots) {
      if (!Number.isFinite(spot.priceUsd) || spot.priceUsd <= 0) continue;
      quoted += 1;
      ticks.push({ symbol: spot.symbol, t: tickAt, priceUsd: spot.priceUsd, source: "jupiter" });
    }
    if (ticks.length === 0) continue;
    try {
      const written = await input.write(ticks);
      if (written.error) {
        dbError = written.error;
        break;
      }
      recorded += written.saved;
    } catch (error) {
      dbError = safeJobError(error);
      break;
    }
  }
  return {
    candidates: input.assets.length,
    quoted,
    recorded,
    dbError,
    rateLimited: state.rateLimited,
  };
}

function emptyBackfill(
  partial: Partial<CoinGeckoBackfillResult> & Pick<CoinGeckoBackfillResult, "idMap" | "rateLimited">,
): CoinGeckoBackfillResult {
  return {
    backfilled: 0,
    pending: 0,
    points: 0,
    noId: 0,
    dbError: null,
    remaining: 0,
    ...partial,
  };
}

async function loadIdMap(input: CoinGeckoBackfillInput, state: CoinGeckoCallState): Promise<Map<string, string>> {
  const sleep = input.sleep ?? defaultSleep;
  const retries = input.idMapRetries ?? 0;
  const guardMs = input.chartGuardMs ?? DEFAULT_CHART_GUARD_MS;
  const merged = new Map<string, string>();
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    state.rateLimited = false;
    const page = await resolveCoinGeckoIdMap({
      fetchImpl: input.fetchImpl,
      apiKey: input.apiKey,
      state,
      timeoutMs: input.timeoutMs,
      sleep,
      deadline: input.deadline,
      clock: input.clock,
      reserveMs: input.deadline === undefined ? 0 : guardMs,
    });
    for (const [symbol, id] of page) {
      if (!merged.has(symbol)) merged.set(symbol, id);
    }
    // Con ids ya sirve: reintentar el listado gasta el tiempo del gráfico.
    if (!state.rateLimited || merged.size > 0) break;
    if (attempt === retries) break;
    await sleep(2_000 * (attempt + 1));
  }
  // El 429 fue del listado. Los ids ya leídos sí se historializan.
  if (merged.size > 0) state.rateLimited = false;
  return merged;
}

/**
 * Historia diaria de CoinGecko para símbolos visibles que todavía no tienen
 * fila `coingecko`. Si el mapa de ids queda vacío, no inventa pendientes.
 * Escribe cada símbolo antes de pedir el siguiente.
 */
export async function runCoinGeckoBackfillJob(input: CoinGeckoBackfillInput): Promise<CoinGeckoBackfillResult> {
  const symbols = [
    ...new Set(input.assets.map((asset) => asset.symbol.trim()).filter((symbol) => symbol.length > 0)),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const state: CoinGeckoCallState = { rateLimited: false };
  const sleep = input.sleep ?? defaultSleep;
  const cap = input.cap ?? 20;
  const paceMs = input.paceMs ?? 0;
  const guardMs = input.chartGuardMs ?? DEFAULT_CHART_GUARD_MS;
  const clock = input.clock ?? Date.now;
  let idMap: Map<string, string>;
  try {
    idMap = await loadIdMap(input, state);
  } catch (error) {
    return emptyBackfill({
      idMap: 0,
      rateLimited: state.rateLimited,
      dbError: safeJobError(error),
      noId: symbols.length,
    });
  }
  const withId = symbols.filter((symbol) => idMap.has(coingeckoSymbol(symbol)));
  const noId = symbols.length - withId.length;
  if (idMap.size === 0) {
    return emptyBackfill({
      idMap: 0,
      rateLimited: state.rateLimited,
      noId: symbols.length,
      remaining: 0,
    });
  }

  const queue: string[] = [];
  let knownDone = 0;
  try {
    for (let index = 0; index < withId.length && queue.length < cap; index += HISTORY_SLICE) {
      const slice = withId.slice(index, index + HISTORY_SLICE);
      const found = await input.hasHistory(slice);
      for (const symbol of slice) {
        if (found.has(symbol)) knownDone += 1;
        else queue.push(symbol);
      }
    }
  } catch (error) {
    return emptyBackfill({
      idMap: idMap.size,
      rateLimited: false,
      dbError: safeJobError(error),
      noId,
      remaining: withId.length,
    });
  }

  const pendingList = queue.slice(0, cap);
  let backfilled = 0;
  let points = 0;
  let dbError: string | null = null;
  let fetched = 0;
  for (const symbol of pendingList) {
    if (state.rateLimited) break;
    if (input.deadline !== undefined && clock() + guardMs > input.deadline) break;
    if (paceMs > 0 && fetched > 0) await sleep(paceMs);
    fetched += 1;
    const result = await fetchCoinGeckoHistory(symbol, {
      fetchImpl: input.fetchImpl,
      apiKey: input.apiKey,
      days: input.days ?? 365,
      idMap,
      state,
      timeoutMs: input.timeoutMs,
      retry429: input.retry429 ?? 0,
      sleep,
    });
    if (state.rateLimited) break;
    if (!result || result.points.length < 2) continue;
    const byT = new Map<number, number>();
    for (const point of result.points) {
      if (!Number.isFinite(point.t) || !Number.isFinite(point.p) || point.p <= 0) continue;
      byT.set(Math.floor(point.t), point.p);
    }
    if (byT.size < 2) continue;
    const ticks: CronTick[] = [...byT.entries()].map(([t, priceUsd]) => ({
      symbol,
      t,
      priceUsd,
      source: "coingecko",
    }));
    let written: TickWriteResult;
    try {
      written = await input.write(ticks);
    } catch (error) {
      dbError = safeJobError(error);
      break;
    }
    if (written.error) {
      dbError = written.error;
      break;
    }
    if (written.saved > 0) {
      backfilled += 1;
      points += written.saved;
    }
  }

  const unprobed = Math.max(0, withId.length - knownDone - queue.length);
  return {
    backfilled,
    pending: queue.length,
    points,
    noId,
    rateLimited: state.rateLimited,
    dbError,
    remaining: unprobed + Math.max(0, queue.length - backfilled),
    idMap: idMap.size,
  };
}

export { safeJobError };
