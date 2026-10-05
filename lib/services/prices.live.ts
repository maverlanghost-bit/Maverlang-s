import "server-only";

import type { FxRate, MarketStatus, PricePoint, Quote } from "@/lib/types";

/**
 * TODO: Jupiter Price API v3 (ARQUITECTURA §10).
 * GET {JUPITER_BASE_URL}/price/v3?ids=<mints>.
 * Precio por acción = precio del token crudo ÷ multiplicador Token-2022 (lib/solana/scaled-ui.ts).
 * Cache 15 s. source: "jupiter". Fallo de red → UPSTREAM.
 * history: proveedor por definir (subyacente o pools).
 * fx: GET FX_SOURCE_URL (mindicador.cl/api/dolar) [VERIFICAR términos], cache 1 h.
 * market: horario de EE.UU.; feriados por definir.
 */
export const livePrices = {
  async list(): Promise<Quote[]> {
    throw new Error("NOT_IMPLEMENTED: Jupiter Price API v3");
  },
  async history(): Promise<PricePoint[]> {
    throw new Error("NOT_IMPLEMENTED: historial de precios (proveedor por definir)");
  },
  async fx(): Promise<FxRate> {
    throw new Error("NOT_IMPLEMENTED: FX USDCLP");
  },
  async market(): Promise<MarketStatus> {
    throw new Error("NOT_IMPLEMENTED: estado del mercado");
  },
};
