import "server-only";

import type { Order, TradeBuildResponse, TradeQuote, TradeSubmitResponse } from "@/lib/types";

/**
 * TODO: Jupiter Swap API, Ultra /order y /execute (ARQUITECTURA §10).
 * Sólo mints de config/tickers.ts. Si la desviación supera PRICE_DEVIATION_MAX_BPS → PRICE_DEVIATION.
 * Si FEE_BPS > 0, insertar una transferencia USDC a FEE_WALLET en la misma transacción.
 * Guardar la orden en Supabase. No llamar a Jupiter desde componentes.
 */
export const liveTrade = {
  async quote(): Promise<TradeQuote> {
    throw new Error("NOT_IMPLEMENTED: Jupiter /order");
  },
  async build(): Promise<TradeBuildResponse> {
    throw new Error("NOT_IMPLEMENTED: Jupiter /order (transacción)");
  },
  async submit(): Promise<TradeSubmitResponse> {
    throw new Error("NOT_IMPLEMENTED: Jupiter /execute");
  },
  async status(): Promise<Order> {
    throw new Error("NOT_IMPLEMENTED: estado de orden en Supabase");
  },
};
