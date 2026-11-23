import type { HistoryMetadata, PricePoint, Range } from "@/lib/types";

/**
 * Velas del TOKEN (xStock en Solana) desde GeckoTerminal, la misma unidad que
 * el titular de la ficha: USD por acción mostrada. Jupiter Price v3 y el pozo
 * ya hablan en acciones mostradas, así que NO se multiplica de nuevo (el
 * multiplicador sólo convierte cantidades en bruto, y escala los cierres del
 * subyacente en `history-series.ts`).
 *
 * API pública sin clave, ~10 llamadas por minuto por IP. Por eso:
 * - el pozo principal de cada mint se resuelve una vez y se guarda 6 h;
 * - cada (mint, rango) se guarda unos segundos y las llamadas simultáneas se
 *   comparten;
 * - un tope móvil de llamadas por minuto y un enfriamiento tras un 429 evitan
 *   agotar el cupo con muchos visitantes;
 * - cualquier fallo devuelve null y quien llama cae a la fuente anterior. Si
 *   hay una serie guardada y vencida (hasta 15 min), se sirve esa antes.
 *
 * `fetchImpl` y el reloj son inyectables: los tests no tocan la red.
 */

export const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2/networks/solana";
const REQUEST_TIMEOUT_MS = 2_500;
const POOL_TTL_MS = 6 * 3_600_000;
const POOL_MISS_TTL_MS = 10 * 60_000;
/** Un pozo con menos liquidez da velas ruidosas: se prefiere la fuente anterior. */
export const MIN_POOL_RESERVE_USD = 1_000;
const STALE_MAX_MS = 15 * 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 8;
const COOLDOWN_MS = 60_000;
/** La última vela no puede alejarse más de esto del precio que informa el pozo. */
const MAX_DEVIATION = 0.5;

const DAY_MS = 86_400_000;

export interface TokenRangeSpec {
  timeframe: "minute" | "hour" | "day";
  aggregate: number;
  /** Casillas pedidas. Los huecos sin operaciones no devuelven vela. */
  limit: number;
  resolution: Extract<HistoryMetadata["resolution"], "15m" | "1h" | "1d">;
  /** Ventana visible; null = todo lo que haya. */
  spanMs: number | null;
  /** Vigencia de la serie en el servidor. */
  ttlMs: number;
}

export const TOKEN_RANGE_SPECS: Readonly<Record<Range, TokenRangeSpec>> = {
  "1D": { timeframe: "minute", aggregate: 15, limit: 96, resolution: "15m", spanMs: DAY_MS, ttlMs: 45_000 },
  "1W": { timeframe: "hour", aggregate: 1, limit: 168, resolution: "1h", spanMs: 7 * DAY_MS, ttlMs: 45_000 },
  "1M": { timeframe: "hour", aggregate: 1, limit: 720, resolution: "1h", spanMs: 30 * DAY_MS, ttlMs: 60_000 },
  "3M": { timeframe: "day", aggregate: 1, limit: 92, resolution: "1d", spanMs: 92 * DAY_MS, ttlMs: 90_000 },
  "1Y": { timeframe: "day", aggregate: 1, limit: 366, resolution: "1d", spanMs: 366 * DAY_MS, ttlMs: 90_000 },
  ALL: { timeframe: "day", aggregate: 1, limit: 1000, resolution: "1d", spanMs: null, ttlMs: 90_000 },
};

export interface TokenOhlcvResult {
  points: PricePoint[];
  metadata: HistoryMetadata;
}

export interface TokenOhlcvOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
}

interface PoolInfo {
  address: string;
  /** Precio del token según el propio pozo, para validar la última vela. */
  referenceUsd: number | null;
}

type PoolRecord = { at: number; ttl: number; pool: PoolInfo | null };
type SeriesRecord = { at: number; ttl: number; value: TokenOhlcvResult };

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function tokenIdOf(relation: unknown): string {
  const id = (relation as { data?: { id?: unknown } } | undefined)?.data?.id;
  return typeof id === "string" ? id.replace(/^solana_/, "") : "";
}

/**
 * El pozo con más reserva donde el mint participa. Entre pozos comparables se
 * prefiere uno donde el xStock es el token base. Sin reserva mínima: null.
 */
export function pickPool(payload: unknown, mint: string): PoolInfo | null {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return null;
  let best: { info: PoolInfo; reserve: number } | null = null;
  for (const row of rows) {
    const attrs = (row as { attributes?: Record<string, unknown> }).attributes;
    const rel = (row as { relationships?: Record<string, unknown> }).relationships;
    if (!attrs || !rel) continue;
    const address = typeof attrs.address === "string" ? attrs.address : "";
    const reserve = num(attrs.reserve_in_usd);
    if (!address || !Number.isFinite(reserve) || reserve < MIN_POOL_RESERVE_USD) continue;
    const base = tokenIdOf(rel.base_token);
    const quote = tokenIdOf(rel.quote_token);
    if (base !== mint && quote !== mint) continue;
    const price = num(base === mint ? attrs.base_token_price_usd : attrs.quote_token_price_usd);
    const info: PoolInfo = { address, referenceUsd: Number.isFinite(price) && price > 0 ? price : null };
    if (!best || reserve > best.reserve) best = { info, reserve };
  }
  return best?.info ?? null;
}

/** [t_s, o, h, l, c, v], más nueva primero → ascendente, ms, OHLC coherente. */
export function parseOhlcvRows(payload: unknown, spanMs: number | null, now: number): PricePoint[] {
  const list = (payload as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  const from = spanMs === null ? 0 : now - spanMs;
  const byTime = new Map<number, PricePoint>();
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const t = num(row[0]) * 1000;
    const o = num(row[1]);
    const h = num(row[2]);
    const l = num(row[3]);
    const c = num(row[4]);
    if (![t, o, h, l, c].every(Number.isFinite) || o <= 0 || h <= 0 || l <= 0 || c <= 0 || t <= 0) continue;
    if (t < from || t > now + 60_000) continue;
    byTime.set(t, { t, p: c, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function tokenMetadata(spec: TokenRangeSpec, mint: string): HistoryMetadata {
  return {
    instrument: "token",
    provider: "geckoterminal",
    providerSymbol: mint,
    resolution: spec.resolution,
    priceUnit: "usd_per_share",
    reference: false,
    capabilities: { ohlc: true, volume: false },
    priceAdjustment: "provider_quote",
  };
}

export function createTokenOhlcv(options: TokenOhlcvOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.now ?? Date.now;
  const baseUrl = (options.baseUrl ?? GECKO_BASE_URL).replace(/\/$/, "");
  const pools = new Map<string, PoolRecord>();
  const poolInflight = new Map<string, Promise<PoolInfo | null>>();
  const series = new Map<string, SeriesRecord>();
  const seriesInflight = new Map<string, Promise<TokenOhlcvResult | null>>();
  const calls: number[] = [];
  let cooldownUntil = 0;

  /** Un GET JSON con tope de espera, de llamadas por minuto y enfriamiento tras 429. */
  async function getJson(url: string): Promise<unknown> {
    const now = clock();
    if (now < cooldownUntil) throw new Error("cooldown");
    while (calls.length > 0 && now - calls[0]! >= RATE_WINDOW_MS) calls.shift();
    if (calls.length >= RATE_MAX_CALLS) throw new Error("rate-budget");
    calls.push(now);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json;version=20230302" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 429) {
        cooldownUntil = clock() + COOLDOWN_MS;
        throw new Error("429");
      }
      if (!response.ok) throw new Error(`http ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolvePool(mint: string): Promise<PoolInfo | null> {
    const hit = pools.get(mint);
    if (hit && clock() - hit.at < hit.ttl) return hit.pool;
    const pending = poolInflight.get(mint);
    if (pending) return pending;
    const job = (async () => {
      try {
        const payload = await getJson(`${baseUrl}/tokens/${encodeURIComponent(mint)}/pools?page=1`);
        const pool = pickPool(payload, mint);
        pools.set(mint, { at: clock(), ttl: pool ? POOL_TTL_MS : POOL_MISS_TTL_MS, pool });
        return pool;
      } catch {
        // Un fallo de red o de cupo no se recuerda como "sin pozo": el siguiente intento puede acertar.
        return hit?.pool ?? null;
      } finally {
        poolInflight.delete(mint);
      }
    })();
    poolInflight.set(mint, job);
    return job;
  }

  async function load(mint: string, range: Range): Promise<TokenOhlcvResult | null> {
    const spec = TOKEN_RANGE_SPECS[range];
    const pool = await resolvePool(mint);
    if (!pool) return null;
    // `token=<mint>` elige el lado del xStock aunque sea el token de cotización del pozo.
    const url =
      `${baseUrl}/pools/${encodeURIComponent(pool.address)}/ohlcv/${spec.timeframe}` +
      `?aggregate=${spec.aggregate}&limit=${spec.limit}&currency=usd&token=${encodeURIComponent(mint)}`;
    const payload = await getJson(url);
    const points = parseOhlcvRows(payload, spec.spanMs, clock());
    if (points.length < 2) return null;
    const last = points[points.length - 1]!.p;
    if (pool.referenceUsd !== null && Math.abs(last / pool.referenceUsd - 1) > MAX_DEVIATION) return null;
    return { points, metadata: tokenMetadata(spec, mint) };
  }

  /**
   * Velas del mint o null (sin pozo líquido, <2 velas, precio incoherente, red,
   * cupo, 429 o tiempo). Con la serie vencida a mano (<15 min) devuelve esa.
   */
  async function history(mint: string, range: Range): Promise<TokenOhlcvResult | null> {
    const key = `${mint}:${range}`;
    const spec = TOKEN_RANGE_SPECS[range];
    const cached = series.get(key);
    const now = clock();
    if (cached && now - cached.at < cached.ttl) return cached.value;
    const pending = seriesInflight.get(key);
    if (pending) return pending;
    const job = load(mint, range)
      .then((value) => {
        if (value) series.set(key, { at: clock(), ttl: spec.ttlMs, value });
        return value ?? (cached && clock() - cached.at < STALE_MAX_MS ? cached.value : null);
      })
      .catch(() => (cached && clock() - cached.at < STALE_MAX_MS ? cached.value : null))
      .finally(() => {
        seriesInflight.delete(key);
      });
    seriesInflight.set(key, job);
    return job;
  }

  return { history, resolvePool };
}

let shared: ReturnType<typeof createTokenOhlcv> | undefined;

/** Instancia del proceso: comparte pozos, series y cupo entre todas las peticiones. */
export function tokenOhlcv(): ReturnType<typeof createTokenOhlcv> {
  shared ??= createTokenOhlcv();
  return shared;
}
