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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `BRK.B` en Yahoo es `BRK-B`. */
export function yahooSymbol(underlying: string): string {
  return underlying.trim().toUpperCase().replace(/\./g, "-");
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

async function fetchOne(
  underlying: string,
  options: UnderlyingMoveOptions,
  cache: Map<string, MoveCacheEntry>,
  now: number,
): Promise<number | null> {
  const hit = cache.get(underlying);
  if (hit && now - hit.at < hit.ttl) return hit.ratio;
  const symbol = yahooSymbol(underlying);
  if (!/^[A-Z0-9-]{1,16}$/.test(symbol)) return null;
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

/** Una entrada por subyacente. La clave es el ticker que llegó (`AAL`), no el de Yahoo. */
export async function fetchUnderlyingChanges(
  underlyings: readonly string[],
  options: UnderlyingMoveOptions = {},
): Promise<Map<string, number>> {
  const cache = options.cache ?? sharedCache;
  const now = options.now?.() ?? Date.now();
  const unique = [...new Set(underlyings.map((item) => item.trim()).filter((item) => item.length > 0))];
  const out = new Map<string, number>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < unique.length) {
      const index = next;
      next += 1;
      const underlying = unique[index];
      if (!underlying) continue;
      const ratio = await fetchOne(underlying, options, cache, now);
      if (ratio !== null) out.set(underlying, ratio);
    }
  }
  const workers = Math.min(CONCURRENCY, unique.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}
