import { describe, expect, it } from "vitest";

import {
  buildSwapParams,
  parsedOrderToTradeQuote,
} from "@/lib/market/jupiter-tx";

/**
 * Tests del puente dominio <-> Jupiter. PURO: sin red.
 *  - buildSwapParams: (lado, monto, moneda, precio) -> { inputMint, outputMint, amountRaw }
 *  - parsedOrderToTradeQuote: ParsedOrder -> TradeQuote (con costos, comisión, desviación)
 */

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLX_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqR8Yv3SKcPbArqfMyzY4f";

describe("buildSwapParams", () => {
  it("compra en USDC: entra USDC, sale la acción", () => {
    const params = buildSwapParams({
      side: "buy",
      amountCurrency: "USDC",
      amount: 100,
      usdcMint: USDC_MINT,
      stockMint: AAPLX_MINT,
      stockDecimals: 8,
      stockMultiplier: 4,
      usdcDecimals: 6,
    });
    expect(params.inputMint).toBe(USDC_MINT);
    expect(params.outputMint).toBe(AAPLX_MINT);
    // 100 USDC = 100 * 10^6 crudos.
    expect(params.amountRaw).toBe(BigInt(100_000_000));
  });

  it("compra en acciones: entra USDC, sale la acción; monto se pasa al llamador", () => {
    // Cuando el usuario pide "N acciones", el crudo de ENTRADA sigue siendo
    // USDC, pero el monto exacto lo decide el llamador tras conocer el precio.
    // buildSwapParams NO calcula eso: recibe amountRaw ya resuelto.
    const params = buildSwapParams({
      side: "buy",
      amountCurrency: "SHARES",
      amountRaw: BigInt(50_000_000), // 50 USDC
      usdcMint: USDC_MINT,
      stockMint: AAPLX_MINT,
      stockDecimals: 8,
      stockMultiplier: 4,
      usdcDecimals: 6,
    });
    expect(params.inputMint).toBe(USDC_MINT);
    expect(params.outputMint).toBe(AAPLX_MINT);
    expect(params.amountRaw).toBe(BigInt(50_000_000));
  });

  it("venta: entra la acción, sale USDC (mints invertidos)", () => {
    const params = buildSwapParams({
      side: "sell",
      amountCurrency: "SHARES",
      amount: 2,
      usdcMint: USDC_MINT,
      stockMint: AAPLX_MINT,
      stockDecimals: 8,
      stockMultiplier: 4,
      usdcDecimals: 6,
    });
    expect(params.inputMint).toBe(AAPLX_MINT);
    expect(params.outputMint).toBe(USDC_MINT);
    // 2 acciones con multiplicador 4 y 8 decimales = 2/4 * 1e8 = 50.000.000 crudos.
    expect(params.amountRaw).toBe(BigInt(50_000_000));
  });
});

describe("parsedOrderToTradeQuote", () => {
  const baseParsed = {
    requestId: "req_1",
    inAmountUi: 100,
    outAmountUi: 0.2934,
    pricePerShareUsd: 340.96,
    priceImpactPct: 0.12,
    slippageBps: 50,
    platformFeeBps: 0,
    isRfq: false,
  };

  it("compra: mapea montos y calcula costo de red cuando abre cuenta", () => {
    const quote = parsedOrderToTradeQuote({
      parsed: baseParsed,
      side: "buy",
      symbol: "AAPLx",
      platformFeeBps: 0,
      networkFeeSol: 0.00001,
      tokenAccountRentSol: 0.0016,
      opensAccount: true,
      priceDeviationBps: 12,
      expiresInMs: 60_000,
    });
    expect(quote.id).toBe("req_1");
    expect(quote.route).toBe("jupiter");
    expect(quote.inAmountUi).toBe(100);
    expect(quote.outAmountUi).toBeCloseTo(0.2934, 6);
    // Sin comisión (bps 0): platformFeeUsd = 0.
    expect(quote.costs.platformFeeUsd).toBe(0);
    // Abre cuenta: renta de ATA > 0.
    expect(quote.costs.tokenAccountRentSol).toBeCloseTo(0.0016, 6);
    expect(quote.costs.networkFeeSol).toBeCloseTo(0.00001, 6);
    expect(quote.priceDeviationBps).toBe(12);
  });

  it("compra sin abrir cuenta: renta = 0", () => {
    const quote = parsedOrderToTradeQuote({
      parsed: baseParsed,
      side: "buy",
      symbol: "AAPLx",
      platformFeeBps: 0,
      networkFeeSol: 0.00001,
      tokenAccountRentSol: 0.0016,
      opensAccount: false,
      priceDeviationBps: 5,
      expiresInMs: 60_000,
    });
    expect(quote.costs.tokenAccountRentSol).toBe(0);
  });

  it("con comisión 50 bps: calcula platformFeeUsd sobre el notional", () => {
    const quote = parsedOrderToTradeQuote({
      parsed: baseParsed,
      side: "buy",
      symbol: "AAPLx",
      platformFeeBps: 50, // 0,5%
      networkFeeSol: 0.00001,
      tokenAccountRentSol: 0,
      opensAccount: false,
      priceDeviationBps: 5,
      expiresInMs: 60_000,
    });
    // Comisión = 100 USDC * 50 / 10000 = 0,5 USD.
    expect(quote.costs.platformFeeUsd).toBeCloseTo(0.5, 6);
    expect(quote.costs.platformFeeBps).toBe(50);
  });

  it("venta: no cobra renta de cuenta (ya existe)", () => {
    const quote = parsedOrderToTradeQuote({
      parsed: baseParsed,
      side: "sell",
      symbol: "AAPLx",
      platformFeeBps: 0,
      networkFeeSol: 0.00001,
      tokenAccountRentSol: 0.0016,
      opensAccount: true, // ignorado en venta
      priceDeviationBps: 5,
      expiresInMs: 60_000,
    });
    expect(quote.costs.tokenAccountRentSol).toBe(0);
  });

  it("ruta RFQ se marca como jupiter igual (mismo route)", () => {
    const quote = parsedOrderToTradeQuote({
      parsed: { ...baseParsed, isRfq: true },
      side: "buy",
      symbol: "ABNBon",
      platformFeeBps: 0,
      networkFeeSol: 0.00001,
      tokenAccountRentSol: 0,
      opensAccount: false,
      priceDeviationBps: 5,
      expiresInMs: 60_000,
    });
    expect(quote.route).toBe("jupiter");
  });
});
