import type { FxRate } from "@/lib/types";

/**
 * Dólar observado (mindicador.cl) con respaldo (open.er-api.com, sin clave).
 * No inventa una tasa: si nada sirve, devuelve null.
 * Cache de un valor válido: 45 min. Un fallo se recuerda 15 s para no
 * repetir la red. El último valor válido se guarda hasta 24 h y, si la
 * fuente falla, se devuelve marcado `stale` para que la app siga en CLP.
 */

export const LIVE_FX_TTL_MS = 45 * 60 * 1000;
export const LIVE_FX_FAIL_TTL_MS = 15_000;
export const LIVE_FX_TIMEOUT_MS = 6_000;
export const LIVE_FX_STALE_MS = 24 * 60 * 60 * 1000;
/** Respaldo público sin clave: `rates.CLP` es el CLP por dólar. */
export const LIVE_FX_FALLBACK_URL = "https://open.er-api.com/v6/latest/USD";

export interface MindicadorRate {
  rate: number;
  updatedAt: string;
  /** true cuando es el último valor válido, no una lectura fresca. */
  stale?: boolean;
}

export interface LiveFxCache {
  rate: MindicadorRate | null;
  storedAt: number;
  failedAt: number;
  inflight: Promise<MindicadorRate | null> | null;
}

export interface LiveFxOptions {
  url: string;
  fallbackUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheMs?: number;
  failCacheMs?: number;
  staleMs?: number;
  now?: () => number;
  cache?: LiveFxCache;
}

export function createLiveFxCache(): LiveFxCache {
  return { rate: null, storedAt: 0, failedAt: 0, inflight: null };
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/** `serie[0].valor` es el dólar observado. `serie[0].fecha` es el día. */
export function parseMindicadorDolar(body: unknown): MindicadorRate | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const serie = (body as { serie?: unknown }).serie;
  if (!Array.isArray(serie) || serie.length === 0) return null;
  const row = serie[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  const rate = positiveNumber((row as { valor?: unknown }).valor);
  const fecha = (row as { fecha?: unknown }).fecha;
  if (rate === null || typeof fecha !== "string" || fecha.trim() === "") return null;
  const time = Date.parse(fecha);
  if (!Number.isFinite(time)) return null;
  return { rate, updatedAt: new Date(time).toISOString() };
}

/**
 * Respaldo open.er-api.com: `rates.CLP` es el CLP por dólar.
 * `time_last_update_utc` es la fecha; si no se puede leer, se usa la hora actual.
 */
export function parseEriaClp(body: unknown): MindicadorRate | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const rates = (body as { rates?: unknown }).rates;
  if (rates === null || typeof rates !== "object" || Array.isArray(rates)) return null;
  const rate = positiveNumber((rates as { CLP?: unknown }).CLP);
  if (rate === null) return null;
  const raw = (body as { time_last_update_utc?: unknown }).time_last_update_utc;
  if (typeof raw === "string" && raw.trim() !== "") {
    const time = Date.parse(raw);
    if (Number.isFinite(time)) return { rate, updatedAt: new Date(time).toISOString() };
  }
  return { rate, updatedAt: new Date().toISOString() };
}

/**
 * `source` es `live` en fresco y `stale` con el último valor válido.
 * La fecha es la de la serie (o del respaldo), no la hora de la consulta.
 */
export function liveFxRate(parsed: MindicadorRate): FxRate {
  return {
    pair: "USDCLP",
    rate: parsed.rate,
    source: parsed.stale === true ? "stale" : "live",
    updatedAt: parsed.updatedAt,
  };
}

type JsonAttempt = { ok: true; body: unknown } | { ok: false };

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<JsonAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { ok: false };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Fuente principal con un reintento rápido ante timeout o error de red. */
async function readPrimary(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<MindicadorRate | null> {
  let attempt = await getJson(url, fetchImpl, timeoutMs);
  if (!attempt.ok) attempt = await getJson(url, fetchImpl, timeoutMs);
  if (!attempt.ok) return null;
  return parseMindicadorDolar(attempt.body);
}

/** Respaldo sin clave, mismo timeout, un intento. */
async function readFallback(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<MindicadorRate | null> {
  const attempt = await getJson(url, fetchImpl, timeoutMs);
  if (!attempt.ok) return null;
  return parseEriaClp(attempt.body);
}

function staleCopy(rate: MindicadorRate | null, now: number, storedAt: number, staleMs: number): MindicadorRate | null {
  if (!rate) return null;
  if (now - storedAt >= staleMs) return null;
  return { rate: rate.rate, updatedAt: rate.updatedAt, stale: true };
}

export async function readUsdClp(options: LiveFxOptions): Promise<MindicadorRate | null> {
  const cache = options.cache ?? createLiveFxCache();
  const now = options.now?.() ?? Date.now();
  const ttl = options.cacheMs ?? LIVE_FX_TTL_MS;
  const failTtl = options.failCacheMs ?? LIVE_FX_FAIL_TTL_MS;
  const staleMs = options.staleMs ?? LIVE_FX_STALE_MS;
  const timeoutMs = options.timeoutMs ?? LIVE_FX_TIMEOUT_MS;
  const fallbackUrl = options.fallbackUrl ?? LIVE_FX_FALLBACK_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (cache.rate && now - cache.storedAt < ttl) return cache.rate;
  const stale = staleCopy(cache.rate, now, cache.storedAt, staleMs);
  if (cache.failedAt > 0 && now - cache.failedAt < failTtl) return stale;
  if (cache.inflight) return cache.inflight;

  const job = (async (): Promise<MindicadorRate | null> => {
    const startedAt = options.now?.() ?? Date.now();
    const primary = await readPrimary(options.url, fetchImpl, timeoutMs);
    const fresh =
      primary ?? (fallbackUrl ? await readFallback(fallbackUrl, fetchImpl, timeoutMs) : null);
    if (fresh) {
      cache.rate = { rate: fresh.rate, updatedAt: fresh.updatedAt };
      cache.storedAt = startedAt;
      cache.failedAt = 0;
      return cache.rate;
    }
    cache.failedAt = startedAt;
    return staleCopy(cache.rate, startedAt, cache.storedAt, staleMs);
  })().finally(() => {
    cache.inflight = null;
  });
  cache.inflight = job;
  return job;
}

/**
 * Calentamiento: dispara el pedido del dólar en segundo plano sin bloquear.
 * Si ya hay valor fresco, un pedido en vuelo o un fallo reciente, no hace nada.
 */
export function warmUsdClp(options: LiveFxOptions): void {
  const cache = options.cache;
  if (!cache) {
    void readUsdClp(options).catch(() => null);
    return;
  }
  const now = options.now?.() ?? Date.now();
  const ttl = options.cacheMs ?? LIVE_FX_TTL_MS;
  const failTtl = options.failCacheMs ?? LIVE_FX_FAIL_TTL_MS;
  if (cache.inflight) return;
  if (cache.rate && now - cache.storedAt < ttl) return;
  if (cache.failedAt > 0 && now - cache.failedAt < failTtl) return;
  void readUsdClp(options).catch(() => null);
}
