import { describe, expect, it } from "vitest";
import { stockLimitPreviewRequestSchema } from "@/lib/api/stock-limit-contracts";
import { stockLimitTerms } from "@/lib/trade/stock-limit-terms";

describe("límite estricto en USDC por acción", () => {
  it("aplica el multiplicador a una compra por USDC", () => {
    expect(stockLimitTerms({
      side: "buy", amount: "60", limitPriceUsdc: "120", stockDecimals: 8, multiplier: 2,
    })).toEqual({ inputAtoms: "60000000", minimumOutputAtoms: "25000000" });
  });

  it("redondea hacia arriba los tokens que debe recibir la compra", () => {
    expect(stockLimitTerms({
      side: "buy", amount: "1", limitPriceUsdc: "3", stockDecimals: 2, multiplier: 1,
    }).minimumOutputAtoms).toBe("34");
  });

  it("limita las acciones debitadas y redondea hacia arriba el mínimo en USDC", () => {
    expect(stockLimitTerms({
      side: "sell", amount: "1.18", limitPriceUsdc: "2.00000001", stockDecimals: 2, multiplier: 3,
    })).toEqual({ inputAtoms: "39", minimumOutputAtoms: "2340001" });
  });

  it("usa el binary64 del mint y conserva los límites que difieren por un átomo", () => {
    const order = { side: "buy", amount: "11", limitPriceUsdc: "1", stockDecimals: 8 } as const;
    expect(stockLimitTerms({ ...order, multiplier: 1.1 }).minimumOutputAtoms).toBe("1000000000");
    expect(stockLimitTerms({ ...order, multiplier: 1.0999999999999999 }).minimumOutputAtoms).toBe("1000000001");
  });

  it("rechaza cero, montos irrepresentables o un multiplicador inválido", () => {
    const order = { side: "buy", amount: "1", limitPriceUsdc: "3", stockDecimals: 2, multiplier: 1 } as const;
    expect(() => stockLimitTerms({ ...order, amount: "0" })).toThrow();
    expect(() => stockLimitTerms({ ...order, amount: "0.00000001" })).toThrow();
    expect(() => stockLimitTerms({ ...order, multiplier: Number.NaN })).toThrow();
    expect(() => stockLimitTerms({ ...order, stockDecimals: 18, amount: "1000" })).toThrow();
  });

  it("acepta decimales como texto y rechaza que el cliente elija mints", () => {
    const request = { side: "buy", amount: "100.25", limitPriceUsdc: "120", symbol: "NVDAx" };
    expect(stockLimitPreviewRequestSchema.safeParse(request).success).toBe(true);
    expect(stockLimitPreviewRequestSchema.safeParse({ ...request, amount: 100.25 }).success).toBe(false);
    expect(stockLimitPreviewRequestSchema.safeParse({ ...request, inputMint: "manipulado" }).success).toBe(false);
  });
});
