import { describe, expect, it } from "vitest";

import { MIN_TRADE_USD } from "@/config/trade";
import { esCL } from "@/content/i18n/es-CL";
import { formatMoney } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";
import { effectiveMinOrderUsd } from "@/lib/market/asset-status.shared";
import { amountBlock, minInCurrency, quickTradeAmounts } from "@/lib/trade/amount";

const FX = 950;
const PRICE = 228.4;
const CASH = 250;

function buyInput(amount: number, currency: "CLP" | "USDC", minUsd: number) {
  return {
    side: "buy" as const,
    currency,
    amount,
    cashUsdc: CASH,
    shares: 0,
    fx: FX,
    priceUsd: PRICE,
    fxPending: false,
    pricePending: false,
    portfolioPending: false,
    minUsd,
  };
}

function shownMinimum(minUsd: number, currency: "CLP" | "USD", rate: number | null) {
  const value = displayPrice(minUsd, currency, rate ?? undefined);
  if (value === null) return formatMoney(minUsd, "USD");
  return formatMoney(value, currency);
}

describe("M43b: mínimo efectivo de compra", () => {
  it("el mínimo efectivo es el máximo entre el global y el de la acción", () => {
    expect(effectiveMinOrderUsd(10)).toBe(10);
    expect(effectiveMinOrderUsd(null)).toBe(MIN_TRADE_USD);
    expect(effectiveMinOrderUsd(0)).toBe(MIN_TRADE_USD);
    expect(effectiveMinOrderUsd(0.5)).toBe(MIN_TRADE_USD);
  });

  it("los montos rápidos en CLP y USD nunca quedan bajo el mínimo", () => {
    const minUsd = effectiveMinOrderUsd(10);
    const minClp = minInCurrency("CLP", minUsd, FX, PRICE);
    expect(minClp).toBe(9500);

    const clp = quickTradeAmounts("CLP", { minUsd, fx: FX, priceUsd: PRICE, max: CASH * FX });
    expect(clp.length).toBeGreaterThan(0);
    expect(clp).not.toContain(5000);
    for (const value of clp) expect(value).toBeGreaterThanOrEqual(minClp as number);

    const usdc = quickTradeAmounts("USDC", { minUsd, fx: FX, priceUsd: PRICE, max: CASH });
    expect(usdc.length).toBeGreaterThan(0);
    for (const value of usdc) expect(value).toBeGreaterThanOrEqual(minUsd);
    expect(usdc[0]).toBeGreaterThanOrEqual(minUsd);
  });

  it("los rápidos respetan el disponible cuando el mínimo cabe", () => {
    const minUsd = effectiveMinOrderUsd(10);
    const usdc = quickTradeAmounts("USDC", { minUsd, fx: FX, priceUsd: PRICE, max: 30 });
    expect(usdc).toEqual([10]);
  });

  it("si ningún predeterminado alcanza, el primero es el mínimo", () => {
    const usdc = quickTradeAmounts("USDC", { minUsd: 200, fx: FX, priceUsd: PRICE, max: null });
    expect(usdc).toEqual([200]);
  });

  it("el bloqueo usa el mínimo efectivo: 5.000 se bloquea y 10.000 pasa", () => {
    const minUsd = effectiveMinOrderUsd(10);
    expect(amountBlock(buyInput(5000, "CLP", minUsd))).toBe("min");
    expect(amountBlock(buyInput(10000, "CLP", minUsd))).toBeNull();
    expect(amountBlock(buyInput(5, "USDC", minUsd))).toBe("min");
    expect(amountBlock(buyInput(11, "USDC", minUsd))).toBeNull();
  });

  it("el mensaje de bloqueo dice el mínimo efectivo, no US$1", () => {
    const minUsd = effectiveMinOrderUsd(10);
    const message = esCL.trade.min.replace("{amount}", shownMinimum(minUsd, "CLP", FX));
    expect(message).toContain("$9.500");
    expect(message).not.toContain("$950");
  });
});
