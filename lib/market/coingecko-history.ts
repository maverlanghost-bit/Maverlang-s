import type { PricePoint } from "@/lib/types";

/**
 * Historial real desde CoinGecko para los gráficos.
 *
 * xStocks está en la categoría `xstocks-ecosystem` (símbolo `aaplx`).
 * Ondo está en `ondo-tokenized-assets` (símbolo `aalon`, no en la de xStocks).
 * `market_chart` devuelve `prices: [[t_ms, usd], …]`.
 *
 * `fetchImpl` es inyectable. Sin id, con menos de dos puntos, o si la red
 * falla, devuelve null: no inventa una serie.
 */

const MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";
const CHART_URL = "https://api.coingecko.com/api/v3/coins";

export const COINGECKO_CATEGORIES = ["xstocks-ecosystem", "ondo-tokenized-assets"] as const;
const PER_PAGE = 250;
const MAX_PAGES = 8;

export interface CoinGeckoCallState {
  /** true si CoinGecko respondió 429 en esta corrida. */
  rateLimited: boolean;
}

export interface CoinGeckoBackfillOptions {
  fetchImpl?: typeof fetch;
  /** API key opcional (plan demo). Sin ella, el ritmo público es escaso. */
  apiKey?: string;
  /** Días de historia (por defecto 365). */
  days?: number;
  /** Tope de símbolos; lo aplica quien llama, no esta función. */
  limit?: number;
  timeoutMs?: number;
  /** Categorías a barrer. Por defecto xStocks y Ondo. */
  categories?: readonly string[];
  /** Páginas de 250 por categoría. */
  maxPages?: number;
  /** La llena este módulo cuando llega un 429. */
  state?: CoinGeckoCallState;
  /** Reintentos extra ante 429 (el cron deja 0; el script local sube). */
  retry429?: number;
  sleep?: (ms: number) => Promise<void>;
  /** No pide otra página de ids si el reloj pasó este instante. La primera sí. */
  deadline?: number;
  clock?: () => number;
  /** Margen que hay que dejar después del mapa (el gráfico es grande). */
  reserveMs?: number;
}

/** Símbolo de Maverlang (AAPLx / AALon) → símbolo de CoinGecko. */
export function coingeckoSymbol(symbol: string): string {
  return symbol.trim().toLowerCase();
}

/** Primera página de xStocks. El test del mapa compara esta URL tal cual. */
export function coingeckoMarketsUrl(category: string, page: number): string {
  return `${MARKETS_URL}?vs_currency=usd&category=${encodeURIComponent(category)}&per_page=${PER_PAGE}&page=${page}`;
}

function coingeckoHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = apiKey?.trim();
  if (key) headers["x-cg-demo-api-key"] = key;
  return headers;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CoinGeckoHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

function noteStatus(state: CoinGeckoCallState | undefined, status: number): void {
  if (status === 429 && state) state.rateLimited = true;
}

interface MarketRow {
  id?: unknown;
  symbol?: unknown;
}

/**
 * Mapa símbolo(minúsculas) → id. Una pasada por categoría, varias páginas.
 * La primera categoría que trae un símbolo gana (xStocks antes que Ondo).
 * Un 429 o un error corta esa categoría y conserva lo ya leído.
 */
export async function resolveCoinGeckoIdMap(
  options: CoinGeckoBackfillOptions = {},
): Promise<Map<string, string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const map = new Map<string, string>();
  const categories = options.categories ?? COINGECKO_CATEGORIES;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const clock = options.clock ?? Date.now;
  const reserveMs = options.reserveMs ?? 0;
  let requests = 0;
  for (const category of categories) {
    if (options.state?.rateLimited) {
      // Un 429 corta la categoría. Con `sleep` se espera y se prueba la siguiente
      // (Ondo no depende de que xStocks haya entrado entera).
      if (!options.sleep) break;
      await options.sleep(1_500);
      options.state.rateLimited = false;
    }
    for (let page = 1; page <= maxPages; page += 1) {
      if (requests > 0 && options.deadline !== undefined && clock() + reserveMs >= options.deadline) {
        return map;
      }
      requests += 1;
      let body: unknown;
      try {
        body = await fetchJson(coingeckoMarketsUrl(category, page), {
          fetchImpl,
          timeoutMs: options.timeoutMs ?? 12_000,
          headers: coingeckoHeaders(options.apiKey),
        });
      } catch (error) {
        if (error instanceof CoinGeckoHttpError) noteStatus(options.state, error.status);
        break;
      }
      if (!Array.isArray(body)) break;
      for (const entry of body) {
        if (entry === null || typeof entry !== "object") continue;
        const row = entry as MarketRow;
        if (typeof row.symbol !== "string" || typeof row.id !== "string") continue;
        const key = row.symbol.trim().toLowerCase();
        if (!key || !row.id || map.has(key)) continue;
        map.set(key, row.id);
      }
      if (body.length < PER_PAGE) break;
    }
  }
  return map;
}

async function fetchJson(
  url: string,
  options: { fetchImpl: typeof fetch; timeoutMs: number; headers: Record<string, string> },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, { signal: controller.signal, headers: options.headers });
    if (!response.ok) throw new CoinGeckoHttpError(response.status);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Id de CoinGecko para un símbolo, o null si no está en las categorías. */
export async function resolveCoinGeckoId(
  symbol: string,
  options: CoinGeckoBackfillOptions = {},
): Promise<string | null> {
  const map = await resolveCoinGeckoIdMap(options);
  return map.get(coingeckoSymbol(symbol)) ?? null;
}

function chartUrl(id: string, days: number, interval: string | null): string {
  const base = `${CHART_URL}/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
  return interval ? `${base}&interval=${interval}` : base;
}

function pointsFromChart(body: unknown): PricePoint[] {
  const prices = body !== null && typeof body === "object" && "prices" in body ? body.prices : null;
  const rows = Array.isArray(prices) ? prices : [];
  return rows
    .filter((row) => Array.isArray(row) && Number.isFinite(row[0]) && Number.isFinite(row[1]) && row[1] > 0)
    .map((row) => ({ t: Math.floor(row[0] as number), p: row[1] as number }));
}

async function fetchChartOnce(
  symbol: string,
  options: CoinGeckoBackfillOptions & { idMap?: Map<string, string> },
): Promise<{ symbol: string; points: PricePoint[] } | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const id = options.idMap?.get(coingeckoSymbol(symbol)) ?? (await resolveCoinGeckoId(symbol, options));
  if (!id) return null;
  const days = options.days ?? 365;
  const interval = days <= 2 ? "hourly" : "daily";
  const request = {
    fetchImpl,
    timeoutMs: options.timeoutMs ?? 12_000,
    headers: coingeckoHeaders(options.apiKey),
  };
  let body: unknown;
  try {
    body = await fetchJson(chartUrl(id, days, interval), request);
  } catch (error) {
    if (!(error instanceof CoinGeckoHttpError)) return null;
    noteStatus(options.state, error.status);
    if (error.status === 429) return null;
    // `interval` a veces queda reservado a planes de pago: se reintenta sin él.
    if (error.status !== 400 && error.status !== 401 && error.status !== 403) return null;
    try {
      body = await fetchJson(chartUrl(id, days, null), request);
    } catch (again) {
      if (again instanceof CoinGeckoHttpError) noteStatus(options.state, again.status);
      return null;
    }
  }
  const points = pointsFromChart(body);
  if (points.length < 2) return null;
  return { symbol, points };
}

/**
 * Historia real de un símbolo. Con `idMap` no vuelve a pedir el listado.
 * Ante 429 devuelve null y marca `state.rateLimited`.
 */
export async function fetchCoinGeckoHistory(
  symbol: string,
  options: CoinGeckoBackfillOptions & { idMap?: Map<string, string> } = {},
): Promise<{ symbol: string; points: PricePoint[] } | null> {
  const retries = options.retry429 ?? 0;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.state) options.state.rateLimited = false;
    const result = await fetchChartOnce(symbol, options);
    if (!options.state?.rateLimited) return result;
    if (attempt === retries) return null;
    await sleep(1_500 * (attempt + 1));
  }
  return null;
}
