import "server-only";

import { serverEnv } from "@/lib/env";
import type { FeeConfig } from "@/lib/types";

/**
 * Comisión propia, leída del env. 0 bps al lanzar.
 * Sólo servidor: no importar este módulo desde un componente cliente.
 */
export const feeConfig: FeeConfig = {
  bps: serverEnv.FEE_BPS,
  wallet: serverEnv.FEE_WALLET ?? null,
  mode: "usdc_transfer",
};

export const priceDeviationMaxBps = serverEnv.PRICE_DEVIATION_MAX_BPS;
export const defaultSlippageBps = serverEnv.DEFAULT_SLIPPAGE_BPS;
