import { MIN_TRADE_USD } from "@/config/trade";

/**
 * Parte pura de `lib/market/asset-status` (M39b). Sin `import "server-only"`,
 * sin `lib/env`, sin `lib/catalog/assets`, sin nada de servidor: los
 * componentes `"use client"` importan SOLO de aquí.
 */

export type AssetTradingMode = "TwentyFourFive" | "MarketHours" | "Regular" | "unknown";
export type AssetPeriod = "market" | "extended" | "overnight" | "closed" | "unknown";
export type AssetStatusSource = "live" | "catalog" | "mock";

export interface AssetStatus {
  mode: AssetTradingMode;
  period: AssetPeriod;
  openNow: boolean;
  nextChangeAt: string | null;
  halted: boolean;
  minOrderUsd: number | null;
  maxOrderUsd: number | null;
  source: AssetStatusSource;
  updatedAt: string;
}

/** Clave i18n del chip del detalle según el estado real. Pura: la usan los tests. */
export type AssetChipKey = "halted" | "market" | "extended" | "overnight" | "closed";

export function chipKeyForStatus(status: Pick<AssetStatus, "halted" | "period" | "openNow">): AssetChipKey {
  if (status.halted) return "halted";
  if (status.period === "market" && status.openNow) return "market";
  if (status.period === "extended") return "extended";
  if (status.period === "overnight") return "overnight";
  return "closed";
}

/** `halted` deshabilita la orden demo con ese motivo. Pura: la usan los tests. */
export function tradeBlockForStatus(status: Pick<AssetStatus, "halted">): "halted" | null {
  return status.halted ? "halted" : null;
}

/** Mínimo efectivo por orden: máximo entre el del activo y US$1. Pura. */
export function effectiveMinOrderUsd(minOrderUsd: number | null | undefined): number {
  if (typeof minOrderUsd === "number" && Number.isFinite(minOrderUsd) && minOrderUsd > 0) {
    return Math.max(minOrderUsd, MIN_TRADE_USD);
  }
  return MIN_TRADE_USD;
}

/**
 * Piso que promete la portada (M45): el menor mínimo real por orden entre
 * las acciones listadas. Los límites por período de xStocks parten en la
 * práctica en ~US$10 (los tests M43b usan 10 como mínimo de la acción), muy
 * por encima de `MIN_TRADE_USD` (US$1). No se calcula con red: el catálogo
 * vive en el servidor y la portada es estática con ISR. Nunca queda bajo lo
 * que exige la hoja de compra (`effectiveMinOrderUsd` es el máximo entre
 * ambos), así que el copy jamás promete menos de lo que la hoja pide.
 */
export const LANDING_MIN_ORDER_USD = 10;

export function normalizeMode(value: unknown): AssetTradingMode {
  if (typeof value !== "string") return "unknown";
  const raw = String(value).trim();
  if (raw === "TwentyFourFive") return "TwentyFourFive";
  if (raw === "MarketHours") return "MarketHours";
  if (raw === "Regular") return "Regular";
  return "unknown";
}

export function normalizePeriod(value: unknown): AssetPeriod {
  if (typeof value !== "string") return "unknown";
  const raw = value.trim().toLowerCase();
  if (raw === "market" || raw === "regular" || raw === "open") return "market";
  if (raw === "extended" || raw === "premarket" || raw === "postmarket" || raw === "post" || raw === "pre")
    return "extended";
  if (raw === "overnight" || raw === "night") return "overnight";
  if (raw === "closed" || raw === "close") return "closed";
  return "unknown";
}
