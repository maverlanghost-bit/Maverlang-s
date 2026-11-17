import { toYahooSymbol } from "@/lib/market/yahoo-symbol";
import type { HistoryMetadata, PricePoint, Range } from "@/lib/types";

/**
 * Variación del día de la acción subyacente.
 * Jupiter Price v3 no manda `priceChange24h` en los mints Ondo (casi no hay
 * canjes, así que el precio del token se queda quieto). El gráfico de Yahoo
 * trae `regularMarketChangePercent` del subyacente: es un porcentaje
 * (−0,389 = −0,389 %), y aquí queda como ratio (−0,00389).
 * Si la red falla, no se inventa un número: el caller deja la variación en 0.
 */

const DEFAULT_TIMEOUT_MS = 2_500;
const SUCCESS_TTL_MS = 60_000;
const MISS_TTL_MS = 30_000;
const CONCURRENCY = 6;
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
/** El punto separa el sufijo de mercado (`ADS.DE`). Sin MIC el símbolo no lo trae. */
const YAHOO_SYMBOL = /^[A-Z0-9.-]{1,32}$/;

interface MoveCacheEntry {
  at: number;
  /** null: se consultó y no hubo un porcentaje usable. */
  ratio: number | null;
  ttl: number;
}

export interface UnderlyingMoveOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cache?: Map<string, MoveCacheEntry>;
}

const sharedCache = new Map<string, MoveCacheEntry>();

/** Un subyacente del catálogo. `exchangeMic` es opcional: sin él no cambia la URL de hoy. */
export interface UnderlyingMoveInput {
  underlying: string;
  exchangeMic?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Símbolo de Yahoo. Sin MIC: mayúsculas y `.` → `-` (`BRK.B` → `BRK-B`).
 * Con MIC de la tabla: letra de mercado pegada y sufijo (`ADSD` + XETR → `ADS.DE`).
 */
export function yahooSymbol(underlying: string, exchangeMic?: string | null): string {
  return toYahooSymbol(underlying, exchangeMic);
}

/**
 * Lee `chart.result[0].meta.regularMarketChangePercent` y lo pasa a ratio.
 * null si el cuerpo no trae un porcentaje finito.
 */
export function parseYahooDailyChange(body: unknown): number | null {
  if (!isRecord(body)) return null;
  const chart = isRecord(body.chart) ? body.chart : null;
  const result = chart && Array.isArray(chart.result) ? chart.result[0] : null;
  if (!isRecord(result)) return null;
  const meta = isRecord(result.meta) ? result.meta : null;
  if (!meta) return null;
  const raw = meta.regularMarketChangePercent;
  const percent = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(percent)) return null;
  return percent / 100;
}

const inflightChanges = new Map<string, Promise<number | null>>();

async function fetchOne(
  underlying: string,
  exchangeMic: string | null | undefined,
  options: UnderlyingMoveOptions,
  cache: Map<string, MoveCacheEntry>,
  now: number,
): Promise<number | null> {
  const hit = cache.get(underlying);
  if (hit && now - hit.at < hit.ttl) return hit.ratio;
  const pending = inflightChanges.get(underlying);
  if (pending) return pending;
  const job = fetchUnderlyingOnce(underlying, exchangeMic, options, cache, now).finally(() => {
    inflightChanges.delete(underlying);
  });
  inflightChanges.set(underlying, job);
  return job;
}

async function fetchUnderlyingOnce(
  underlying: string,
  exchangeMic: string | null | undefined,
  options: UnderlyingMoveOptions,
  cache: Map<string, MoveCacheEntry>,
  now: number,
): Promise<number | null> {
  const symbol = toYahooSymbol(underlying, exchangeMic);
  if (!YAHOO_SYMBOL.test(symbol)) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`yahoo ${response.status}`);
    const ratio = parseYahooDailyChange(await response.json());
    cache.set(underlying, { at: now, ratio, ttl: ratio === null ? MISS_TTL_MS : SUCCESS_TTL_MS });
    return ratio;
  } catch {
    cache.set(underlying, { at: now, ratio: null, ttl: MISS_TTL_MS });
    return null;
  }
}

/** Lo ya guardado, sin esperar a la red. Sirve si la lista no puede quedarse hasta el último gráfico. */
export function cachedUnderlyingChanges(
  underlyings: readonly string[],
  now = Date.now(),
  cache: Map<string, MoveCacheEntry> = sharedCache,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const underlying of underlyings) {
    const hit = cache.get(underlying);
    if (!hit || now - hit.at >= hit.ttl || hit.ratio === null) continue;
    out.set(underlying, hit.ratio);
  }
  return out;
}

function asInput(item: string | UnderlyingMoveInput): UnderlyingMoveInput {
  return typeof item === "string" ? { underlying: item } : item;
}

/** Una entrada por subyacente. La clave es el ticker que llegó (`AAL`, `ADSD`), no el de Yahoo. */
export async function fetchUnderlyingChanges(
  underlyings: readonly (string | UnderlyingMoveInput)[],
  options: UnderlyingMoveOptions = {},
): Promise<Map<string, number>> {
  const cache = options.cache ?? sharedCache;
  const now = options.now?.() ?? Date.now();
  const seen = new Set<string>();
  const unique: UnderlyingMoveInput[] = [];
  for (const item of underlyings) {
    const input = asInput(item);
    const underlying = input.underlying.trim();
    if (!underlying || seen.has(underlying)) continue;
    seen.add(underlying);
    unique.push({ underlying, exchangeMic: input.exchangeMic });
  }
  const out = new Map<string, number>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < unique.length) {
      const index = next;
      next += 1;
      const input = unique[index];
      if (!input) continue;
      const ratio = await fetchOne(input.underlying, input.exchangeMic, options, cache, now);
      if (ratio !== null) out.set(input.underlying, ratio);
    }
  }
  const workers = Math.min(CONCURRENCY, unique.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/**
 * Serie del gráfico del subyacente, ya en ms y USD, con OHLCV observado opcional.
 * Es el respaldo del histórico cuando `underlying_prices` no tiene filas
 * recientes: la tabla se llena por cron y puede quedar días atrás.
 * Sin caché de Next ni `server-only`: cualquiera puede llamarlo desde el server.
 */
export type UnderlyingChartPoint = PricePoint;

export interface UnderlyingChartHistory {
  points: UnderlyingChartPoint[];
  metadata: HistoryMetadata;
}

interface ChartQuery {
  /** `range` de Yahoo. */
  range: string;
  /** `interval` de Yahoo. */
  interval: "15m" | "1h" | "1d" | "1wk";
}

/** 1D y 1W comparten `5d`: con 15m/1h Yahoo devuelve las dos últimas jornadas. */
const CHART_QUERIES: Record<Range, ChartQuery> = {
  "1D": { range: "5d", interval: "15m" },
  "1W": { range: "5d", interval: "1h" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  ALL: { range: "5y", interval: "1wk" },
};

/** El gráfico de 1D son dos jornadas, y nunca más de 48 barras de 15m. */
const ONE_DAY_SESSIONS = 2;
const ONE_DAY_POINTS = 48;
const SERIES_TTL_MS = 60_000;

interface SeriesCacheEntry {
  at: number;
  /** []; Yahoo no sirvió la serie (o no la tiene para ese símbolo). */
  value: UnderlyingChartHistory;
}

const seriesCache = new Map<string, SeriesCacheEntry>();
const inflightSeries = new Map<string, Promise<UnderlyingChartHistory>>();

function yahooChartResult(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  const chart = isRecord(body.chart) ? body.chart : null;
  const result = chart && Array.isArray(chart.result) ? chart.result[0] : null;
  return isRecord(result) ? result : null;
}

/**
 * Empareja timestamp y arrays quote de la MISMA barra. No usa adjclose para
 * construir OHLC, no rellena un open/high/low ausente a partir del cierre y
 * no transforma sondeos en volumen. Un cierre útil conserva su valor incluso
 * cuando el proveedor no entregó una barra completa.
 */
export function parseYahooChartSeries(body: unknown): UnderlyingChartPoint[] {
  const result = yahooChartResult(body);
  if (!result) return [];
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = isRecord(result.indicators) ? result.indicators : null;
  const quotes = indicators && Array.isArray(indicators.quote) ? indicators.quote : [];
  const quote = isRecord(quotes[0]) ? quotes[0] : null;
  const closes = quote && Array.isArray(quote.close) ? quote.close : [];
  const opens = quote && Array.isArray(quote.open) ? quote.open : [];
  const highs = quote && Array.isArray(quote.high) ? quote.high : [];
  const lows = quote && Array.isArray(quote.low) ? quote.low : [];
  const volumes = quote && Array.isArray(quote.volume) ? quote.volume : [];
  const points: UnderlyingChartPoint[] = [];
  const size = Math.min(timestamps.length, closes.length);
  for (let i = 0; i < size; i += 1) {
    const seconds = timestamps[i];
    const close = closes[i];
    const t = typeof seconds === "number" ? seconds * 1000 : Number.NaN;
    const p = typeof close === "number" ? close : Number.NaN;
    if (!Number.isFinite(t) || t <= 0) continue;
    if (!Number.isFinite(p) || p <= 0) continue;
    const point: UnderlyingChartPoint = { t, p };
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    if (typeof open === "number" && Number.isFinite(open) && open > 0 &&
        typeof high === "number" && Number.isFinite(high) && high > 0 &&
        typeof low === "number" && Number.isFinite(low) && low > 0 &&
        high >= Math.max(open, p) && low <= Math.min(open, p)) {
      point.o = open;
      point.h = high;
      point.l = low;
      point.c = p;
    }
    const volume = volumes[i];
    if (typeof volume === "number" && Number.isFinite(volume) && volume >= 0) point.v = volume;
    points.push(point);
  }
  return points;
}

/** Últimas `sessions` jornadas (fecha UTC), con tope de `limit` puntos. */
function keepLastSessions(
  points: readonly UnderlyingChartPoint[],
  sessions: number,
  limit: number,
): UnderlyingChartPoint[] {
  const days: string[] = [];
  let start = 0;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (!point) continue;
    const day = new Date(point.t).toISOString().slice(0, 10);
    if (days.includes(day)) continue;
    if (days.length === sessions) {
      start = i + 1;
      break;
    }
    days.push(day);
  }
  const trimmed = points.slice(start);
  return trimmed.length > limit ? trimmed.slice(trimmed.length - limit) : trimmed;
}

function emptyChartHistory(symbol: string): UnderlyingChartHistory {
  return {
    points: [],
    metadata: {
      instrument: "underlying", provider: "yahoo", providerSymbol: symbol,
      resolution: "unknown", priceUnit: "usd_per_share", reference: true,
      priceAdjustment: "provider_quote", capabilities: { ohlc: false, volume: false },
    },
  };
}

async function fetchChartHistory(
  underlying: string,
  range: Range,
  timeoutMs: number,
): Promise<UnderlyingChartHistory> {
  const symbol = toYahooSymbol(underlying);
  if (!YAHOO_SYMBOL.test(symbol)) return emptyChartHistory(symbol);
  const query = CHART_QUERIES[range];
  const url = `${CHART_URL}/${encodeURIComponent(symbol)}?range=${query.range}&interval=${query.interval}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`yahoo ${response.status}`);
  const body: unknown = await response.json();
  const result = yahooChartResult(body);
  const meta = result && isRecord(result.meta) ? result.meta : null;
  // Los precios de este contrato son USD. Un símbolo cotizado en otra moneda
  // no puede convertirse a USD sólo por llevar ese nombre en el tipo.
  if (meta?.currency !== "USD") return emptyChartHistory(symbol);
  const allPoints = parseYahooChartSeries(body).sort((a, b) => a.t - b.t);
  const points = range === "1D" ? keepLastSessions(allPoints, ONE_DAY_SESSIONS, ONE_DAY_POINTS) : allPoints;
  const rawResolution = meta.dataGranularity;
  const resolution = rawResolution === "15m" || rawResolution === "1h" || rawResolution === "1d" || rawResolution === "1wk"
    ? rawResolution : "unknown";
  const sharesVolume = meta.instrumentType === "EQUITY" || meta.instrumentType === "ETF";
  // Con unidad de volumen desconocida se conserva el cierre, sin habilitar
  // ni transportar una magnitud que la UI podría presentar como acciones.
  if (!sharesVolume) for (const point of points) delete point.v;
  return {
    points,
    metadata: {
      ...emptyChartHistory(symbol).metadata,
      resolution,
      ...(sharesVolume ? { volumeUnit: "underlying_shares", volumeScope: "underlying_market" } as const : {}),
      capabilities: {
        ohlc: points.length >= 2 && points.every((point) => point.o !== undefined && point.h !== undefined && point.l !== undefined && point.c !== undefined),
        volume: sharesVolume && points.length >= 2 && points.every((point) => point.v !== undefined),
      },
    },
  };
}

/**
 * Serie del gráfico de Yahoo para el subyacente, con un minuto de caché.
 * Nunca lanza: si la red falla devuelve [] y el caller decide el respaldo.
 */
export async function fetchYahooChartSeries(
  underlying: string,
  range: Range,
  options: { timeoutMs?: number } = {},
): Promise<UnderlyingChartPoint[]> {
  return (await fetchYahooChartHistory(underlying, range, options)).points;
}

/** Misma lectura y caché que fetchYahooChartSeries, conservando procedencia y resolución. */
export async function fetchYahooChartHistory(
  underlying: string,
  range: Range,
  options: { timeoutMs?: number } = {},
): Promise<UnderlyingChartHistory> {
  const key = `${underlying}${range}`;
  const hit = seriesCache.get(key);
  if (hit && Date.now() - hit.at < SERIES_TTL_MS) return hit.value;
  const pending = inflightSeries.get(key);
  if (pending) return pending;
  const job = fetchChartHistory(underlying, range, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    .then((value) => {
      seriesCache.set(key, { at: Date.now(), value });
      return value;
    })
    .catch(() => {
      const value = emptyChartHistory(toYahooSymbol(underlying));
      seriesCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inflightSeries.delete(key);
    });
  inflightSeries.set(key, job);
  return job;
}
