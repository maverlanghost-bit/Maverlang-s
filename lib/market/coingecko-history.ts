import type { PricePoint } from "@/lib/types";
import type { TickSource } from "@/lib/services/price-ticks.supabase";

/**
 * Backfill de historial REAL de precios desde CoinGecko (xStocks).
 *
 * CoinGecko indexa los xStocks bajo la categoría `xstocks-ecosystem`; el
 * `symbol` que devuelve es el símbolo del token en minúsculas (AAPLx → applex,
 * NVDAx → nvdx). `market_chart` entrega `prices: [[t_ms, usd], …]`.
 *
 * Sirve para que los gráficos tengan meses de historia real desde el primer
 * día (el grabador del spot sólo acumula desde que se despliega). Delgado y
 * testeable: `fetchImpl` inyectable, igual que el resto de clientes del repo.
 *
 * Rate limits: sin API key el plan público es escaso; el backfill corre pocas
 * veces y en lotes pequeños. Ante 429 o error devuelve [] y no rompe.
 */

const MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";
const CHART_URL = "https://api.coingecko.com/api/v3/coins";

const SOURCE: TickSource = "coingecko";

export interface CoinGeckoBackfillOptions {
  fetchImpl?: typeof fetch;
  /** API key opcional (plan demo/pro). Sin ella, el rate limit público es escaso. */
  apiKey?: string;
  /** Días de historia a traer (por defecto 365; el plan free tope ahí). */
  days?: number;
  /** Cuántos símbolos backfillear como máximo en esta corrida. */
  limit?: number;
  timeoutMs?: number;
}

/** Símbolo de Maverlang (AAPLx) → símbolo de CoinGecko (aaplx). */
export function coingeckoSymbol(symbol: string): string {
  return symbol.trim().toLowerCase();
}

/** Header de la key si existe (demo o pro). Sin key, nada. */
function coingeckoHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = apiKey?.trim();
  if (key) headers["x-cg-demo-api-key"] = key;
  return headers;
}

interface MarketRow {
  id: string;
  symbol: string;
  current_price: number | null;
}

/**
 * Mapa símbolo(minúsculas) → id de CoinGecko, resuelto una vez por corrida y
 * reutilizado para todos los símbolos. La lista de xStocks cambia poco; traer
 * 250 filas por símbolo gastaría el rate limit sin necesidad.
 */
export async function resolveCoinGeckoIdMap(
  options: CoinGeckoBackfillOptions = {},
): Promise<Map<string, string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const url = `${MARKETS_URL}?vs_currency=usd&category=xstocks-ecosystem&per_page=250&page=1`;
    const body = (await fetchJson(url, {
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 8000,
      headers: coingeckoHeaders(options.apiKey),
    })) as MarketRow[];
    if (!Array.isArray(body)) return new Map();
    const map = new Map<string, string>();
    for (const row of body) {
      if (typeof row?.symbol === "string" && typeof row?.id === "string") {
        map.set(row.symbol.toLowerCase(), row.id);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchJson(
  url: string,
  options: { fetchImpl: typeof fetch; timeoutMs: number; headers: Record<string, string> },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, { signal: controller.signal, headers: options.headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Resuelve id de CoinGecko para un símbolo xStock, o null si no está listado. */
export async function resolveCoinGeckoId(
  symbol: string,
  options: CoinGeckoBackfillOptions = {},
): Promise<string | null> {
  const map = await resolveCoinGeckoIdMap(options);
  return map.get(coingeckoSymbol(symbol)) ?? null;
}

/**
 * Trae la historia real de un símbolo y la devuelve como puntos.
 * `days` mapea a granularidad: <=2 horario, <=90 diario, más diario.
 * Si se pasa `idMap` (de `resolveCoinGeckoIdMap`), evita re-consultar la lista.
 */
export async function fetchCoinGeckoHistory(
  symbol: string,
  options: CoinGeckoBackfillOptions & { idMap?: Map<string, string> } = {},
): Promise<{ symbol: string; points: PricePoint[] } | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const id = options.idMap?.get(coingeckoSymbol(symbol)) ?? (await resolveCoinGeckoId(symbol, options));
  if (!id) return null;
  const days = options.days ?? 365;
  const interval = days <= 2 ? "hourly" : "daily";
  try {
    const url = `${CHART_URL}/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
    const body = (await fetchJson(url, {
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 8000,
      headers: coingeckoHeaders(options.apiKey),
    })) as {
      prices?: [number, number][];
    };
    const rows = Array.isArray(body?.prices) ? body.prices : [];
    const points: PricePoint[] = rows
      .filter((row) => Array.isArray(row) && Number.isFinite(row[0]) && Number.isFinite(row[1]) && row[1] > 0)
      .map(([t, p]) => ({ t: Math.floor(t), p }));
    if (points.length < 2) return null;
    return { symbol, points };
  } catch {
    return null;
  }
}
