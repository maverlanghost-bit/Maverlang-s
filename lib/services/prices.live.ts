import "server-only";

import type { Connection } from "@solana/web3.js";

import { tickerBySymbol } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { mockMarketStatus } from "@/lib/mocks/market";
import { createLiveFxCache, liveFxRate, readUsdClp, warmUsdClp, type LiveFxCache } from "@/lib/market/live-fx";
import {
  createPriceBatcherCache,
  listBatchedQuotes,
  type PriceBatcherCache,
} from "@/lib/market/price-batcher";
import { fetchUnderlyingChanges } from "@/lib/market/underlying-move";
import { readHistory } from "@/lib/services/price-ticks.supabase";
import { getServerConnection } from "@/lib/solana/connection";
import { fetchMintMultiplier } from "@/lib/solana/scaled-ui";
import type { FxRate, MarketStatus, PricePoint, Quote, Range, Ticker } from "@/lib/types";

/**
 * Precio actual real y dólar observado. El historial no pasa por Jupiter:
 * ticks o cierres, y un vacío no se rellena con la serie de referencia.
 * `PRICE_DEVIATION_MAX_BPS` no filtra esta lista: un precio real puede alejarse
 * de la ancla del demo. Esa guardia sigue en la cotización de la orden.
 */

const fxCache: LiveFxCache = createLiveFxCache();

/**
 * Calentamiento (M40b): al primer uso del servicio de precios se dispara el
 * pedido del dólar en segundo plano, sin bloquear, para que la primera
 * pantalla ya lo tenga en cache.
 */
function warmFx(): void {
  warmUsdClp({
    url: serverEnv.FX_SOURCE_URL,
    fallbackUrl: serverEnv.FX_FALLBACK_URL,
    fetchImpl: fetch,
    cache: fxCache,
  });
}

const cache: PriceBatcherCache = createPriceBatcherCache();
const multiplierCache = new Map<string, { at: number; value: number; ttl: number }>();
const MULTIPLIER_TTL_MS = 5 * 60 * 1000;
const MULTIPLIER_MISS_TTL_MS = 60_000;
const MULTIPLIER_TIMEOUT_MS = 800;

function priceUrl(): string {
  const base = serverEnv.JUPITER_BASE_URL.replace(/\/$/, "");
  if (base.endsWith("/price/v3")) return base;
  return `${base}/price/v3`;
}

async function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  const settled = work.then(
    () => undefined,
    () => undefined,
  );
  try {
    await Promise.race([settled, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Lee el multiplicador Token-2022. Si el RPC no responde a tiempo, queda 1
 * y la lectura sigue en segundo plano para la próxima consulta.
 */
async function readMultipliers(tickers: readonly Ticker[]): Promise<ReadonlyMap<string, number>> {
  const now = Date.now();
  const out = new Map<string, number>();
  const pending: Ticker[] = [];
  for (const ticker of tickers) {
    const hit = multiplierCache.get(ticker.mint);
    if (hit && now - hit.at < hit.ttl) out.set(ticker.symbol, hit.value);
    else pending.push(ticker);
  }
  if (pending.length === 0) return out;

  let connection: Connection;
  try {
    connection = getServerConnection();
  } catch {
    return out;
  }

  const reads = Promise.all(
    pending.map(async (ticker) => {
      try {
        const value = await fetchMintMultiplier(connection, ticker.mint);
        if (!Number.isFinite(value) || value <= 0) return;
        multiplierCache.set(ticker.mint, { at: Date.now(), value, ttl: MULTIPLIER_TTL_MS });
        out.set(ticker.symbol, value);
      } catch {
        multiplierCache.set(ticker.mint, { at: Date.now(), value: 1, ttl: MULTIPLIER_MISS_TTL_MS });
        out.set(ticker.symbol, 1);
      }
    }),
  );
  await withTimeout(reads, MULTIPLIER_TIMEOUT_MS);
  return new Map(out);
}

export const livePrices = {
  /**
   * Jupiter Price v3 vía el batcher (lotes de 50, cache por mint de 15 s,
   * `stale` tras un 429 o un error). Un ticker ausente o inválido vuelve a
   * la ancla (`source: "mock"`, `reference: true`). El caller sólo entra con
   * `PRICES_MODE=live`. Acepta hasta 50 símbolos por llamada.
   */
  async list(symbols: string[]): Promise<Quote[]> {
    warmFx();
    return listBatchedQuotes(symbols, {
      fetchImpl: fetch,
      priceUrl: priceUrl(),
      apiKey: serverEnv.JUPITER_API_KEY,
      cache,
      prepareMultipliers: readMultipliers,
      // Un intento. El reintento por defecto (2,5 s × 3 + esperas) supera el
      // sondeo de 5 s de la ficha y la petición no llega a cerrarse.
      timeoutMs: 2_500,
      backoffMs: [],
      // Ondo: Jupiter no manda priceChange24h. La variación es la del subyacente.
      // La lista no espera el último gráfico: con 400 ms extra sale con lo ya
      // guardado y el resto entra en el próximo refresco (caché de 60 s).
      underlyingChange: (underlyings) => fetchUnderlyingChanges(underlyings, { fetchImpl: fetch }),
      underlyingBudgetMs: 400,
    });
  },

  /**
   * Multiplicador Token-2022, sin Jupiter. El historial lo usa sólo para
   * escalar cierres; el precio de la ficha sale de `list`.
   * Si el RPC no alcanza el tope de 800 ms, queda 1 y la lectura sigue.
   */
  async multiplierFor(symbol: string): Promise<number> {
    const ticker = tickerBySymbol(symbol);
    if (!ticker) return 1;
    const map = await readMultipliers([ticker]);
    const value = map.get(ticker.symbol);
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
  },

  /**
   * Historial de `price_ticks` para un rango. Orden ascendente, con tope
   * y abort en la lectura. [] si no hay filas o la base no responde.
   * No rellena con la serie de referencia.
   */
  async history(symbol: string, range: Range): Promise<PricePoint[]> {
    try {
      return await readHistory(symbol, range);
    } catch {
      return [];
    }
  },

  /**
   * Dólar observado. Activo cuando `getServices` entra con `PRICES_MODE=live`.
   * GET {FX_SOURCE_URL} (default https://mindicador.cl/api/dolar). [VERIFICAR licencia].
   * `serie[0].valor` es el CLP por dólar. `serie[0].fecha` es el día.
   * `source` es "live" en fresco y "stale" con el último valor válido (hasta 24 h).
   * Cache 45 min. Timeout 6 s con un reintento rápido. Fallo recordado 15 s.
   * Respaldo {FX_FALLBACK_URL} (open.er-api.com, `rates.CLP`, sin clave).
   * Red, JSON inválido, serie vacía o valor que no es un número > 0 → UPSTREAM.
   * No se sustituye por el dólar mock.
   */
  async fx(): Promise<FxRate> {
    const parsed = await readUsdClp({
      url: serverEnv.FX_SOURCE_URL,
      fallbackUrl: serverEnv.FX_FALLBACK_URL,
      fetchImpl: fetch,
      cache: fxCache,
    });
    if (!parsed) throw new DomainError("UPSTREAM", "Dólar no disponible");
    return liveFxRate(parsed);
  },

  /**
   * Horario del subyacente en America/New_York, lunes a viernes, 09:30–16:00.
   * Cálculo local (sin red): un throw aquí hacía fallar `/api/market/status`
   * en cada carga de la ficha y el cliente lo reintentaba.
   * Feriados de EE.UU. [POR DEFINIR]. `/api/market/status` sigue en no-store.
   */
  async market(): Promise<MarketStatus> {
    return mockMarketStatus();
  },
};
