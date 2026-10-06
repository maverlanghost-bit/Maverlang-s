import "server-only";

import type { Connection } from "@solana/web3.js";

import { serverEnv } from "@/lib/env";
import { createLivePriceCache, listLiveQuotes, type LivePriceCache } from "@/lib/market/live-quotes";
import { getServerConnection } from "@/lib/solana/connection";
import { fetchMintMultiplier } from "@/lib/solana/scaled-ui";
import type { FxRate, MarketStatus, PricePoint, Quote, Ticker } from "@/lib/types";

/**
 * Precio actual real. El historial, el dólar y el horario siguen sin proveedor live.
 * `PRICE_DEVIATION_MAX_BPS` no filtra esta lista: un precio real puede alejarse
 * de la ancla del demo. Esa guardia sigue en la cotización de la orden.
 */

const cache: LivePriceCache = createLivePriceCache();
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
   * Jupiter Price v3, con cache corta. Un ticker ausente o inválido vuelve a la ancla
   * (`source: "mock"`, `reference: true`). El caller sólo entra con `PRICES_MODE=live`.
   */
  async list(symbols: string[]): Promise<Quote[]> {
    return listLiveQuotes(symbols, {
      fetchImpl: fetch,
      priceUrl: priceUrl(),
      apiKey: serverEnv.JUPITER_API_KEY,
      cache,
      prepareMultipliers: readMultipliers,
    });
  },

  /**
   * TODO historial. Proveedor [POR DEFINIR]: precio del subyacente o de los pools del mint.
   * Parámetros: symbol operable y range `1W | 1M | 3M | 1Y | ALL`.
   * Mapeo a PricePoint: `t` en unix ms, `p` en USD por acción (precio crudo ÷ multiplicador).
   *   Si el proveedor no guarda el multiplicador de ese día, usar el vigente y dejarlo anotado.
   * Errores: símbolo no operable → MINT_NOT_ALLOWED. Proveedor caído → UPSTREAM.
   * Cache: por symbol y range, unos minutos, cuando exista proveedor. Hoy no hay endpoint.
   * `getServices` sigue sirviendo el historial mock.
   */
  async history(): Promise<PricePoint[]> {
    throw new Error("NOT_IMPLEMENTED: historial de precios (proveedor por definir)");
  },

  /**
   * TODO FX USDCLP.
   * Endpoint: GET {FX_SOURCE_URL} (default https://mindicador.cl/api/dolar). [VERIFICAR licencia].
   * Respuesta: `serie[0].valor` es el dólar observado en CLP. `serie[0].fecha` es el día.
   * Mapeo a FxRate: pair "USDCLP", rate = valor, source = la URL, updatedAt = esa fecha.
   * Errores: red, JSON inválido o serie vacía → UPSTREAM. No inventar un tipo de cambio.
   * Cache: 1 h.
   */
  async fx(): Promise<FxRate> {
    throw new Error("NOT_IMPLEMENTED: FX USDCLP");
  },

  /**
   * TODO estado del mercado del subyacente. No hay endpoint externo.
   * Regla: America/New_York, lunes a viernes, 09:30–16:00. Feriados de EE.UU. [POR DEFINIR].
   * Mapeo a MarketStatus: underlyingOpen, session (`regular` | `offHours` | `closed`), nextChange (ISO del próximo corte), note opcional.
   * Sábado y domingo en Nueva York: `closed`. Lun–vie fuera de 09:30–16:00: `offHours`.
   * Errores: no es UPSTREAM mientras el cálculo sea local.
   * Cache: como máximo 60 s; depende del reloj. `/api/market/status` sigue en no-store.
   */
  async market(): Promise<MarketStatus> {
    throw new Error("NOT_IMPLEMENTED: estado del mercado");
  },
};
