/**
 * Lógica pura de la cuenta demo por usuario. Refleja `demo_trade` de 0003:
 * costo promedio ponderado, validación de saldo (compra) y de acciones (venta).
 * Los mensajes cortos del SQL ('saldo_insuficiente', ...) se mapean a
 * `DomainError` en `lib/services/demo.supabase.ts`.
 */

export type DemoSide = "buy" | "sell";

export function roundClp(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundAvgUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Precio en pesos de una acción, redondeado como el SQL. */
export function priceClpOf(priceUsd: number, usdclp: number): number {
  return roundClp(priceUsd * usdclp);
}

/** Total en pesos de la orden, redondeado como el SQL. */
export function totalClpOf(shares: number, priceUsd: number, usdclp: number): number {
  return roundClp(shares * priceClpOf(priceUsd, usdclp));
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
  usdclp: number;
}): "monto_invalido" | null {
  if (!input.symbol || input.symbol.trim() === "") return "monto_invalido";
  if (input.side !== "buy" && input.side !== "sell") return "monto_invalido";
  if (!(input.shares > 0) || !Number.isFinite(input.shares)) return "monto_invalido";
  if (!(input.priceUsd > 0) || !Number.isFinite(input.priceUsd)) return "monto_invalido";
  if (!(input.usdclp > 0) || !Number.isFinite(input.usdclp)) return "monto_invalido";
  return null;
}

/** Compra: el total no puede superar el saldo. Venta: las acciones no pueden superar la posición. */
export function validateDemoFunds(input: {
  side: DemoSide;
  totalClp: number;
  cashClp: number;
  shares: number;
  positionShares: number;
}): "saldo_insuficiente" | "acciones_insuficientes" | null {
  if (input.side === "buy") {
    if (input.cashClp + 1e-9 < input.totalClp) return "saldo_insuficiente";
    return null;
  }
  if (input.positionShares + 1e-9 < input.shares) return "acciones_insuficientes";
  return null;
}
