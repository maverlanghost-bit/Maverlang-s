import "server-only";

import type { FxRate, MarketStatus, PricePoint, Quote } from "@/lib/types";

/**
 * Precios live. No llama a la red: cada método lanza NOT_IMPLEMENTED.
 * El contrato de la fase siguiente está en los TODO (ARQUITECTURA §10).
 */
export const livePrices = {
  /**
   * TODO Jupiter Price API v3.
   * Endpoint: GET {JUPITER_BASE_URL}/price/v3?ids={mints}
   *   ids: hasta 50 mints de la allowlist, separados por coma. Header `x-api-key`: JUPITER_API_KEY.
   * Respuesta: `{ [mint]: { usdPrice, priceChange24h, blockId, decimals, createdAt, liquidity } }`.
   *   `usdPrice` es el precio del token crudo. `priceChange24h` es un porcentaje (1,29 = +1,29 %), no un ratio.
   *   Si Jupiter no confía en el precio, omite esa clave.
   * Mapeo a Quote: symbol con `tickerByMint`; priceUsd = `rawPriceToSharePrice(usdPrice, multiplicador)`;
   *   change24hPct = priceChange24h / 100; multiplier = `fetchMintMultiplier` (Token-2022);
   *   updatedAt = ahora; source = "jupiter". Mint ausente en la respuesta: no inventar Quote.
   * Errores: red, 401 o 429 → UPSTREAM. Mint fuera de la allowlist → MINT_NOT_ALLOWED. Sin API key → INTERNAL.
   * Cache: 15 s en memoria por mint. `/api/prices` sigue en no-store.
   */
  async list(): Promise<Quote[]> {
    throw new Error("NOT_IMPLEMENTED: Jupiter Price API v3");
  },

  /**
   * TODO historial. Proveedor [POR DEFINIR]: precio del subyacente o de los pools del mint.
   * Parámetros: symbol operable y range `1W | 1M | 3M | 1Y | ALL`.
   * Mapeo a PricePoint: `t` en unix ms, `p` en USD por acción (precio crudo ÷ multiplicador).
   *   Si el proveedor no guarda el multiplicador de ese día, usar el vigente y dejarlo anotado.
   * Errores: símbolo no operable → MINT_NOT_ALLOWED. Proveedor caído → UPSTREAM.
   * Cache: por symbol y range, unos minutos, cuando exista proveedor. Hoy no hay endpoint.
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
   * Mapeo a MarketStatus: underlyingOpen, nextChange (ISO del próximo corte), note opcional.
   * Errores: no es UPSTREAM mientras el cálculo sea local.
   * Cache: como máximo 60 s; depende del reloj. `/api/market/status` sigue en no-store.
   */
  async market(): Promise<MarketStatus> {
    throw new Error("NOT_IMPLEMENTED: estado del mercado");
  },
};
