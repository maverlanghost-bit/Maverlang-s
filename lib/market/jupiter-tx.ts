import { roundDigits } from "@/lib/mocks/number";
import { uiAmountToRaw } from "@/lib/market/jupiter-order";
import type { Side, TradeQuote } from "@/lib/types";

/**
 * Puente dominio <-> Jupiter Swap v2. PURO: sin red.
 *  - `buildSwapParams`: petición de trade -> mints y monto crudo del swap.
 *  - `parsedOrderToTradeQuote`: respuesta de Jupiter -> `TradeQuote` del dominio,
 *    con costos, comisión propia y desviación de precio.
 *
 * Convención de lados:
 *  - Compra: entra USDC, sale la acción (inputMint=USDC, outputMint=acción).
 *  - Venta: entra la acción, sale USDC (inputMint=acción, outputMint=USDC).
 * El monto crudo (`amountRaw`) es siempre el del mint de ENTRADA.
 */

export interface SwapParamsInput {
  side: Side;
  /** Moneda en que el usuario expresó el monto. */
  amountCurrency: "CLP" | "USDC" | "SHARES";
  /** Monto en UI. Sólo se usa cuando no se pasa `amountRaw` directo. */
  amount?: number;
  /** Crudo ya resuelto por el llamador (cuando hizo falta el precio). */
  amountRaw?: bigint;
  usdcMint: string;
  stockMint: string;
  stockDecimals: number;
  /** Multiplicador Token-2022 de la acción (1 si no aplica). */
  stockMultiplier: number;
  usdcDecimals: number;
}

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
}

/**
 * Traduce la petición a los parámetros del swap. En compra con USDC el crudo
 * es directo (amount * 10^6). En venta por acciones, el crudo de la acción
 * lleva el multiplicador Token-2022. Si el llamador ya resolvió el crudo
 * (compra por acciones, que necesita el precio), lo respeta.
 */
export function buildSwapParams(input: SwapParamsInput): SwapParams {
  const buy = input.side === "buy";
  const inputMint = buy ? input.usdcMint : input.stockMint;
  const outputMint = buy ? input.stockMint : input.usdcMint;

  let amountRaw: bigint;
  if (input.amountRaw !== undefined) {
    amountRaw = input.amountRaw;
  } else if (buy && input.amountCurrency === "USDC") {
    amountRaw = uiAmountToRaw(input.amount ?? 0, input.usdcDecimals, 1);
  } else if (!buy && input.amountCurrency === "SHARES") {
    amountRaw = uiAmountToRaw(input.amount ?? 0, input.stockDecimals, input.stockMultiplier);
  } else {
    // Compra por CLP o por acciones: el llamador debe resolver el crudo con
    // el precio/FX y pasarlo por `amountRaw`.
    throw new Error("amountRaw requerido: resuelve el monto con precio/FX antes de cotizar");
  }

  return { inputMint, outputMint, amountRaw };
}

export interface QuoteBridgeInput {
  /** Lo que devolvió `parseJupiterOrder`. */
  parsed: {
    requestId: string;
    inAmountUi: number;
    outAmountUi: number;
    pricePerShareUsd: number;
    priceImpactPct: number;
    slippageBps: number;
    platformFeeBps: number;
    isRfq: boolean;
  };
  side: Side;
  symbol: string;
  /** Comisión propia en bps (0 al lanzamiento). */
  platformFeeBps: number;
  networkFeeSol: number;
  tokenAccountRentSol: number;
  /** true sólo en compra cuando el usuario aún no tiene el token (abre ATA). */
  opensAccount: boolean;
  priceDeviationBps: number;
  expiresInMs: number;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

/**
 * Convierte una orden de Jupiter en el `TradeQuote` del dominio. Calcula la
 * comisión propia sobre el notional en USDC (compra: lo que entra; venta: lo
 * que sale). La renta de ATA sólo aplica en compra cuando se abre la cuenta.
 */
export function parsedOrderToTradeQuote(input: QuoteBridgeInput): TradeQuote {
  const now = input.now?.() ?? Date.now();
  const buy = input.side === "buy";
  const notionalUsd = buy ? input.parsed.inAmountUi : input.parsed.outAmountUi;

  const platformFeeUsd =
    input.platformFeeBps > 0 ? roundDigits((notionalUsd * input.platformFeeBps) / 10_000, 6) : 0;

  // Rent sólo en compra que abre cuenta; en venta el ATA de la acción ya existe.
  const tokenAccountRentSol = buy && input.opensAccount ? input.tokenAccountRentSol : 0;

  return {
    id: input.parsed.requestId,
    side: input.side,
    symbol: input.symbol,
    inAmountUi: roundDigits(input.parsed.inAmountUi, 8),
    outAmountUi: roundDigits(input.parsed.outAmountUi, 8),
    pricePerShareUsd: roundDigits(input.parsed.pricePerShareUsd, 6),
    costs: {
      platformFeeUsd,
      platformFeeBps: input.platformFeeBps,
      networkFeeSol: input.networkFeeSol,
      tokenAccountRentSol,
      priceImpactPct: input.parsed.priceImpactPct,
      slippageBps: input.parsed.slippageBps,
    },
    priceDeviationBps: Math.round(input.priceDeviationBps),
    expiresAt: new Date(now + input.expiresInMs).toISOString(),
    route: "jupiter",
  };
}
