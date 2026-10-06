import { MIN_TRADE_USD } from "@/config/trade";
import type { Side } from "@/lib/types";

export type TradeAmountCurrency = "CLP" | "USDC" | "SHARES";

/** `wait` = todavía no hay saldo, precio o tipo de cambio. */
export type AmountBlock = "empty" | "min" | "funds" | "fx" | "price" | "wait";

export function parseAmount(raw: string): number {
  if (raw.trim() === "" || raw === ".") return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function notionalUsd(
  amount: number,
  currency: TradeAmountCurrency,
  fx: number | null,
  priceUsd: number | null,
): number | null {
  if (!(amount > 0)) return 0;
  if (currency === "USDC") return amount;
  if (currency === "CLP") {
    if (!(fx && fx > 0)) return null;
    return amount / fx;
  }
  if (!(priceUsd && priceUsd > 0)) return null;
  return amount * priceUsd;
}

export function maxAmount(input: {
  side: Side;
  currency: TradeAmountCurrency;
  cashUsdc: number;
  shares: number;
  fx: number | null;
  priceUsd: number | null;
}): number | null {
  const { side, currency, cashUsdc, shares, fx, priceUsd } = input;
  if (side === "buy") {
    if (currency !== "CLP" && currency !== "USDC") return null;
    if (currency === "USDC") return Math.max(0, cashUsdc);
    if (!(fx && fx > 0)) return null;
    return Math.max(0, cashUsdc * fx);
  }
  if (currency === "SHARES") return Math.max(0, shares);
  if (currency !== "USDC") return null;
  if (!(priceUsd && priceUsd > 0)) return null;
  return Math.max(0, shares * priceUsd);
}

function overMax(amount: number, max: number, currency: TradeAmountCurrency): boolean {
  const epsilon = currency === "CLP" ? 0.49 : 1e-8;
  return amount > max + epsilon;
}

export function amountBlock(input: {
  side: Side;
  currency: TradeAmountCurrency;
  amount: number;
  cashUsdc: number;
  shares: number;
  fx: number | null;
  priceUsd: number | null;
  fxPending: boolean;
  pricePending: boolean;
  portfolioPending: boolean;
  /** Mínimo efectivo en USD (M39/M43b). Por defecto `MIN_TRADE_USD`. */
  minUsd?: number;
}): AmountBlock | null {
  const { currency, amount, side, fx, priceUsd, fxPending, pricePending, portfolioPending } = input;
  const floor =
    typeof input.minUsd === "number" && Number.isFinite(input.minUsd) && input.minUsd > 0
      ? Math.max(input.minUsd, MIN_TRADE_USD)
      : MIN_TRADE_USD;
  if (portfolioPending) return "wait";
  if (currency === "CLP" && fx === null && fxPending) return "wait";
  if (currency === "CLP" && !(fx && fx > 0)) return "fx";
  const needsPrice = currency === "SHARES" || (side === "sell" && currency === "USDC");
  if (needsPrice && priceUsd === null && pricePending) return "wait";
  if (needsPrice && !(priceUsd && priceUsd > 0)) return "price";

  const max = maxAmount(input);
  if (max === null) return currency === "CLP" ? "fx" : "price";
  const maxUsd = notionalUsd(max, currency, fx, priceUsd);
  if (!(amount > 0)) {
    if (maxUsd !== null && maxUsd + 1e-9 < floor) return "funds";
    return "empty";
  }
  if (overMax(amount, max, currency)) return "funds";
  const usd = notionalUsd(amount, currency, fx, priceUsd);
  if (usd === null) return currency === "CLP" ? "fx" : "price";
  if (usd + 1e-9 < floor) return "min";
  return null;
}

export function roundAmount(amount: number, currency: TradeAmountCurrency): string {
  if (!(amount > 0) || !Number.isFinite(amount)) return "";
  if (currency === "CLP") return String(Math.max(0, Math.round(amount)));
  const places = currency === "USDC" ? 2 : 6;
  const factor = 10 ** places;
  const rounded = Math.round(amount * factor) / factor;
  if (!(rounded > 0)) return "";
  return String(rounded);
}

/** Convierte el monto al cambiar de moneda. Vacío si falta el precio o el tipo de cambio. */
export function convertAmount(
  amount: number,
  from: TradeAmountCurrency,
  to: TradeAmountCurrency,
  fx: number | null,
  priceUsd: number | null,
): string {
  if (from === to) return roundAmount(amount, to);
  if (!(amount > 0)) return "";
  const usd = notionalUsd(amount, from, fx, priceUsd);
  if (usd === null || !(usd > 0)) return "";
  if (to === "USDC") return roundAmount(usd, "USDC");
  if (to === "CLP") {
    if (!(fx && fx > 0)) return "";
    return roundAmount(usd * fx, "CLP");
  }
  if (!(priceUsd && priceUsd > 0)) return "";
  return roundAmount(usd / priceUsd, "SHARES");
}

const DEFAULT_QUICK: Record<TradeAmountCurrency, readonly number[]> = {
  CLP: [5000, 10000, 50000],
  USDC: [10, 50, 100],
  SHARES: [0.01, 0.1, 1],
};

function effectiveFloor(minUsd: number | null | undefined): number {
  if (typeof minUsd === "number" && Number.isFinite(minUsd) && minUsd > 0) {
    return Math.max(minUsd, MIN_TRADE_USD);
  }
  return MIN_TRADE_USD;
}

/** Mínimo efectivo expresado en la moneda del monto. Null si falta fx/precio. Pura. */
export function minInCurrency(
  currency: TradeAmountCurrency,
  minUsd: number | null | undefined,
  fx: number | null,
  priceUsd: number | null,
): number | null {
  const floor = effectiveFloor(minUsd);
  if (currency === "USDC") return Math.ceil(floor * 100 - 1e-9) / 100;
  if (currency === "CLP") {
    if (!(fx && fx > 0)) return null;
    return Math.max(1, Math.ceil(floor * fx - 1e-9));
  }
  if (!(priceUsd && priceUsd > 0)) return null;
  const raw = floor / priceUsd;
  if (!(raw > 0)) return null;
  return Math.ceil(raw * 1_000_000 - 1e-9) / 1_000_000;
}

/**
 * Montos rápidos válidos (M43b): nunca bajo el mínimo efectivo y, cuando se
 * puede, sin pasar el disponible (`max` en la misma moneda). Si ningún
 * predeterminado sirve pero el mínimo cabe en el disponible, devuelve el
 * mínimo redondeado hacia arriba. Si ni el mínimo cabe, devuelve vacío (la UI
 * conserva el chip Máx). Pura: la usan la hoja y los tests.
 */
export function quickTradeAmounts(
  currency: TradeAmountCurrency,
  opts: { minUsd: number | null | undefined; fx: number | null; priceUsd: number | null; max?: number | null },
): number[] {
  const defaults = DEFAULT_QUICK[currency] ?? [];
  const minCur = minInCurrency(currency, opts.minUsd, opts.fx, opts.priceUsd);
  if (minCur === null) return [...defaults];
  const eps = currency === "CLP" ? 0.49 : 1e-9;
  let valid = defaults.filter((value) => value + eps >= minCur);
  const max = opts.max;
  const maxKnown = typeof max === "number" && Number.isFinite(max) && max >= 0;
  if (maxKnown && (max as number) + eps >= minCur) {
    valid = valid.filter((value) => value <= (max as number) + eps);
  }
  if (valid.length > 0) return [...valid];
  if (!maxKnown || (max as number) + eps >= minCur) return [minCur];
  return [];
}
