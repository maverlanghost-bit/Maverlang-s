import "server-only";

import type { Activity, Balance, Portfolio, TradeBuildResponse } from "@/lib/types";

/**
 * TODO: getTokenAccountsByOwner con Token-2022 + precios de prices.live (ARQUITECTURA §10).
 * Acciones = raw / 10^decimals × multiplicador. Nunca devolver cantidades crudas a la UI.
 * sendBuild: transferencia SPL del mint permitido, con validación de dirección.
 */
export const livePortfolio = {
  async get(): Promise<Portfolio> {
    throw new Error("NOT_IMPLEMENTED: cartera on-chain");
  },
  async balances(): Promise<Balance[]> {
    throw new Error("NOT_IMPLEMENTED: getTokenAccountsByOwner");
  },
  async activity(): Promise<Activity[]> {
    throw new Error("NOT_IMPLEMENTED: actividad on-chain / orders");
  },
  async sendBuild(): Promise<TradeBuildResponse> {
    throw new Error("NOT_IMPLEMENTED: transferencia SPL Token-2022 o USDC");
  },
};
