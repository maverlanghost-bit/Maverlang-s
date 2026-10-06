import type { FxRate } from "@/lib/types";

/**
 * Dólar observado (mindicador.cl). No inventa una tasa: si la respuesta no sirve, devuelve null.
 * Cache de un valor válido: 45 min. Un fallo se recuerda 60 s para no repetir la red.
 */

export const LIVE_FX_TTL_MS = 45 * 60 * 1000;
export const LIVE_FX_FAIL_TTL_MS = 60_000;
export const LIVE_FX_TIMEOUT_MS = 2_500;

export interface MindicadorRate {
  rate: number;
  updatedAt: string;
}

export interface LiveFxCache {
  rate: MindicadorRate | null;
  storedAt: number;
  failedAt: number;
  inflight: Promise<MindicadorRate | null> | null;
}

export interface LiveFxOptions {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheMs?: number;
  failCacheMs?: number;
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

/** `source` es `live`. La fecha es la de la serie, no la hora de la consulta. */
export function liveFxRate(parsed: MindicadorRate): FxRate {
  return {
    pair: "USDCLP",
    rate: parsed.rate,
    source: "live",
    updatedAt: parsed.updatedAt,
  };
}

async function fetchRate(options: LiveFxOptions): Promise<MindicadorRate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? LIVE_FX_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(options.url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return parseMindicadorDolar(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function readUsdClp(options: LiveFxOptions): Promise<MindicadorRate | null> {
  const cache = options.cache ?? createLiveFxCache();
  const now = options.now?.() ?? Date.now();
  const ttl = options.cacheMs ?? LIVE_FX_TTL_MS;
  const failTtl = options.failCacheMs ?? LIVE_FX_FAIL_TTL_MS;
  if (cache.rate && now - cache.storedAt < ttl) return cache.rate;
  if (cache.failedAt > 0 && now - cache.failedAt < failTtl) return null;
  if (cache.inflight) return cache.inflight;

  const job = fetchRate(options)
    .then((rate) => {
      if (rate) {
        cache.rate = rate;
        cache.storedAt = now;
        cache.failedAt = 0;
      } else {
        cache.failedAt = now;
      }
      return rate;
    })
    .finally(() => {
      cache.inflight = null;
    });
  cache.inflight = job;
  return job;
}
