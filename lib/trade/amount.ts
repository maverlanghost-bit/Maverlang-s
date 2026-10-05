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
}): AmountBlock | null {
  const { currency, amount, side, fx, priceUsd, fxPending, pricePending, portfolioPending } = input;
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
    if (maxUsd !== null && maxUsd + 1e-9 < MIN_TRADE_USD) return "funds";
    return "empty";
  }
  if (overMax(amount, max, currency)) return "funds";
  const usd = notionalUsd(amount, currency, fx, priceUsd);
  if (usd === null) return currency === "CLP" ? "fx" : "price";
  if (usd + 1e-9 < MIN_TRADE_USD) return "min";
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
