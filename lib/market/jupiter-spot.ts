/**
 * Spot real de Jupiter Price v3 para los crons de `price_ticks`.
 * Sólo números que vienen en la respuesta (`usdPrice` o, si no hay
 * `priceChange24h`, `stockData.price`). Si el mint no trae precio, se omite:
 * no hay ancla ni precio inventado.
 */

export const JUPITER_LITE_PRICE_URL = "https://lite-api.jup.ag/price/v3";
export const JUPITER_BATCH = 50;

export interface JupiterSpotAsset {
  symbol: string;
  mint: string;
}

export interface JupiterSpot {
  symbol: string;
  priceUsd: number;
}

export interface JupiterCallState {
  /** true si Jupiter respondió 429. El caller no debe pedir otro lote. */
  rateLimited: boolean;
  /** Si `api.jup.ag` rechazó la clave, los lotes siguientes usan la URL lite. */
  priceUrl?: string;
}

export interface JupiterSpotOptions {
  fetchImpl?: typeof fetch;
  /** `https://api.jup.ag/price/v3` o la base ya con `/price/v3`. */
  priceUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  /** No empieza otro lote si el reloj pasó este instante. */
  deadline?: number;
  now?: () => number;
  /** Se comparte entre llamadas para no reintentar `api.jup.ag` en cada lote. */
  state?: JupiterCallState;
}

export function jupiterPriceUrl(base: string): string {
  const trimmed = base.trim().replace(/\/$/, "");
  if (trimmed.endsWith("/price/v3")) return trimmed;
  return `${trimmed}/price/v3`;
}

function positive(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function finite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Precio que muestra la app: el del subyacente cuando Jupiter no manda
 * `priceChange24h` (típico en Ondo). Misma regla que `shownMintPrice`.
 */
export function spotFromJupiterRow(row: unknown): number | null {
  if (!isRow(row)) return null;
  const usd = positive(row.usdPrice);
  if (usd === null) return null;
  const change = finite(row.priceChange24h);
  const stock = isRow(row.stockData) ? row.stockData : null;
  const market = stock ? positive(stock.price) : null;
  const shown = change === null && market !== null ? market : usd;
  if (!Number.isFinite(shown) || shown <= 0) return null;
  return Math.round(shown * 1e6) / 1e6;
}

async function fetchChunk(
  priceUrl: string,
  mints: readonly string[],
  options: JupiterSpotOptions,
): Promise<{ status: number; body: unknown }> {
  const endpoint = new URL(priceUrl);
  endpoint.searchParams.set("ids", mints.join(","));
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = options.apiKey?.trim();
  if (apiKey) headers["x-api-key"] = apiKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { status: response.status, body: null };
    return { status: response.status, body: (await response.json()) as unknown };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

function spotsFromBody(assets: readonly JupiterSpotAsset[], body: unknown): JupiterSpot[] {
  if (!isRow(body)) return [];
  const out: JupiterSpot[] = [];
  for (const asset of assets) {
    const priceUsd = spotFromJupiterRow(body[asset.mint]);
    if (priceUsd === null) continue;
    out.push({ symbol: asset.symbol, priceUsd });
  }
  return out;
}

/**
 * Cotizaciones reales por mint. Lotes de 50. Si `api.jup.ag` responde
 * 401/403 o no llega, el resto de la corrida usa el endpoint público
 * `lite-api.jup.ag` (el mismo que ya usa el monitor del catálogo).
 */
export async function fetchJupiterSpots(
  assets: readonly JupiterSpotAsset[],
  options: JupiterSpotOptions,
): Promise<JupiterSpot[]> {
  const priced = assets.filter((asset) => asset.mint.trim() !== "" && asset.symbol.trim() !== "");
  const out: JupiterSpot[] = [];
  let priceUrl = jupiterPriceUrl(options.state?.priceUrl?.trim() || options.priceUrl);
  const lite = JUPITER_LITE_PRICE_URL;
  const now = options.now ?? Date.now;
  for (let index = 0; index < priced.length; index += JUPITER_BATCH) {
    if (options.deadline !== undefined && now() >= options.deadline) break;
    const chunk = priced.slice(index, index + JUPITER_BATCH);
    let result = await fetchChunk(priceUrl, chunk.map((asset) => asset.mint), options);
    const authOrDown = result.status === 0 || result.status === 401 || result.status === 403;
    if (authOrDown && priceUrl !== lite) {
      priceUrl = lite;
      if (options.state) options.state.priceUrl = lite;
      result = await fetchChunk(priceUrl, chunk.map((asset) => asset.mint), options);
    }
    if (result.status === 429) {
      if (options.state) options.state.rateLimited = true;
      break;
    }
    out.push(...spotsFromBody(chunk, result.body));
  }
  return out;
}
