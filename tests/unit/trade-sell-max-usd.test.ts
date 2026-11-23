import { describe, expect, it } from "vitest";

import { amountBlock, convertAmount, maxAmount, resolveSellRequest } from "@/lib/trade/amount";

const price = 187.3333;
const shares = 0.534161; // valor 100,0640... USD: el centavo mostrado redondea hacia arriba

function sellBlock(amount: number, currency: "USDC" | "SHARES") {
  return amountBlock({
    side: "sell",
    currency,
    amount,
    cashUsdc: 0,
    shares,
    fx: null,
    priceUsd: price,
    fxPending: false,
    pricePending: false,
    portfolioPending: false,
    minUsd: 10,
  });
}

describe("vender el máximo en USD", () => {
  it("el valor mostrado (redondeado al centavo) no se bloquea como «acciones insuficientes»", () => {
    const value = shares * price;
    const shown = Math.round(value * 100) / 100;
    const priceUp = 200.005;
    const sharesUp = 1; // 200,005 -> 200,01 sube sobre el valor real
    const shownUp = Math.round(sharesUp * priceUp * 100) / 100;
    expect(shownUp).toBeGreaterThan(sharesUp * priceUp);
    const blocked = amountBlock({
      side: "sell", currency: "USDC", amount: shownUp, cashUsdc: 0, shares: sharesUp, fx: null,
      priceUsd: priceUp, fxPending: false, pricePending: false, portfolioPending: false, minUsd: 10,
    });
    expect(blocked).toBeNull();
    expect(sellBlock(shown, "USDC")).toBeNull();
  });

  it("un monto claramente mayor al valor sigue bloqueado", () => {
    expect(sellBlock(shares * price + 0.5, "USDC")).toBe("funds");
  });

  it("USD >= valor de la posición menos un centavo vende exactamente el saldo en acciones", () => {
    const max = maxAmount({ side: "sell", currency: "USDC", cashUsdc: 0, shares, fx: null, priceUsd: price }) as number;
    for (const usd of [max, Math.round(max * 100) / 100, Math.ceil(max * 100) / 100, max - 0.009]) {
      expect(resolveSellRequest({ currency: "USDC", amount: usd, shares, priceUsd: price })).toEqual({
        amount: shares,
        currency: "SHARES",
      });
    }
  });

  it("nunca pide más acciones que el saldo", () => {
    const out = resolveSellRequest({ currency: "USDC", amount: shares * price + 0.01, shares, priceUsd: price });
    expect(out.currency).toBe("SHARES");
    expect(out.amount).toBeLessThanOrEqual(shares);
  });

  it("un monto parcial queda en USD", () => {
    expect(resolveSellRequest({ currency: "USDC", amount: 50, shares, priceUsd: price })).toEqual({
      amount: 50,
      currency: "USDC",
    });
  });

  it("en acciones recorta el ruido de coma flotante al saldo", () => {
    expect(resolveSellRequest({ currency: "SHARES", amount: shares + 1e-9, shares, priceUsd: price })).toEqual({
      amount: shares,
      currency: "SHARES",
    });
    expect(resolveSellRequest({ currency: "SHARES", amount: shares / 2, shares, priceUsd: price }).amount).toBe(shares / 2);
  });

  it("Acciones → USD con el máximo vuelve a ser el saldo completo", () => {
    const usd = Number(convertAmount(shares, "SHARES", "USDC", null, price));
    expect(sellBlock(usd, "USDC")).toBeNull();
    expect(resolveSellRequest({ currency: "USDC", amount: usd, shares, priceUsd: price })).toEqual({
      amount: shares,
      currency: "SHARES",
    });
  });
});
