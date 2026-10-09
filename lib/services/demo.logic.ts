/**
 * Lógica pura de la cuenta demo por usuario. Refleja `demo_trade` de 0007:
 * saldo en USD, costo promedio ponderado en USD (el promedio en CLP es sólo
 * informativo), validación de saldo (compra) y de acciones (venta).
 * Los mensajes cortos del SQL ('saldo_insuficiente', ...) se mapean a
 * `DomainError` en `lib/services/demo.supabase.ts`.
 */

/** Saldo inicial de la demo: US$10.000 ficticios. */
export const DEMO_INITIAL_USD = 10_000;

export type DemoSide = "buy" | "sell";

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundClp(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundAvgUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Precio en pesos de una acción, redondeado como el SQL (sólo informativo). */
export function priceClpOf(priceUsd: number, usdclp: number): number {
  return roundClp(priceUsd * usdclp);
}

/** Total en dólares de la orden, redondeado como el SQL. */
export function totalUsdOf(shares: number, priceUsd: number): number {
  return roundUsd(shares * priceUsd);
}

/**
 * Nuevo costo promedio tras una compra. `prevShares` 0 = primera compra.
 * Devuelve el promedio en USD (6 decimales) y en CLP (2 decimales).
 */
export function weightedAverageCost(input: {
  prevShares: number;
  prevAvgUsd: number;
  prevAvgClp: number;
  newShares: number;
  priceUsd: number;
  priceClp: number;
}): { avgUsd: number; avgClp: number; shares: number } {
  const shares = input.prevShares + input.newShares;
  if (!(shares > 0)) throw new Error("monto_invalido");
  const avgUsd = roundAvgUsd((input.prevShares * input.prevAvgUsd + input.newShares * input.priceUsd) / shares);
  const avgClp = roundClp((input.prevShares * input.prevAvgClp + input.newShares * input.priceClp) / shares);
  return { avgUsd, avgClp, shares };
}

export function validateDemoTradeInput(input: {
  symbol: string;
  side: DemoSide;
  shares: number;
  priceUsd: number;
  /** Opcional desde 0007: si no viene, la operación igual se hace. */
  usdclp?: number | null;
}): "monto_invalido" | null {
  if (!input.symbol || input.symbol.trim() === "") return "monto_invalido";
  if (input.side !== "buy" && input.side !== "sell") return "monto_invalido";
  if (!(input.shares > 0) || !Number.isFinite(input.shares)) return "monto_invalido";
  if (!(input.priceUsd > 0) || !Number.isFinite(input.priceUsd)) return "monto_invalido";
  if (input.usdclp !== undefined && input.usdclp !== null) {
    if (!(input.usdclp > 0) || !Number.isFinite(input.usdclp)) return "monto_invalido";
  }
  return null;
}

/** Compra: el total en USD no puede superar el saldo. Venta: las acciones no pueden superar la posición. */
export function validateDemoFunds(input: {
  side: DemoSide;
  totalUsd: number;
  cashUsd: number;
  shares: number;
  positionShares: number;
}): "saldo_insuficiente" | "acciones_insuficientes" | null {
  if (input.side === "buy") {
    if (input.cashUsd + 1e-9 < input.totalUsd) return "saldo_insuficiente";
    return null;
  }
  if (input.positionShares + 1e-9 < input.shares) return "acciones_insuficientes";
  return null;
}
