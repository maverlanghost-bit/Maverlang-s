import { describe, expect, it } from "vitest";

import {
  parseJupiterOrder,
  jupiterSwapUrl,
  jupiterOrderParams,
  rawAmountToUi,
  uiAmountToRaw,
  type JupiterOrderLike,
  type OrderParseOptions,
} from "@/lib/market/jupiter-order";

/**
 * Tests del parser de cotización de Jupiter Swap v2 (`/swap/v2/order`).
 * El parser es PURO: recibe el cuerpo JSON tal cual y no toca la red.
 * Con las keys reales, `trade.live.ts` llamará a la API y pasará el cuerpo
 * aquí; estos tests fijan la forma esperada de la respuesta.
 */

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLX_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqR8Yv3SKcPbArqfMyzY4f"; // forma Xs de xStocks

function baseOrder(): Record<string, unknown> {
  return {
    requestId: "req_abc123",
    inputMint: USDC_MINT,
    outputMint: AAPLX_MINT,
    inAmount: "1000000", // 1 USDC (6 decimales)
    outAmount: "2934", // unidades crudas de salida
    priceImpactPct: "0.12",
    slippageBps: 50,
    routePlan: [{ swapInfo: { label: "Raydium" } }],
  };
}

describe("jupiterOrderParams", () => {
  it("arma la query con los mints invertidos para una compra", () => {
    const params = jupiterOrderParams({
      side: "buy",
      inputMint: USDC_MINT,
      outputMint: AAPLX_MINT,
      amountRaw: BigInt(1_000_000),
      slippageBps: 50,
      taker: "8CF2g1p3rWqbvN9Yk9z9eWqbvN9Yk9z9eWqbvN9Yk",
    });
    // Compra: entra USDC, sale la acción. Los mints NO se invierten aquí
    // (el servicio los pasa ya en el orden correcto según el lado).
    expect(params.get("inputMint")).toBe(USDC_MINT);
    expect(params.get("outputMint")).toBe(AAPLX_MINT);
    expect(params.get("amount")).toBe("1000000");
    expect(params.get("slippageBps")).toBe("50");
    expect(params.get("taker")).toBe("8CF2g1p3rWqbvN9Yk9z9eWqbvN9Yk9z9eWqbvN9Yk");
  });

  it("omite el taker cuando no se pasa (cotización pura)", () => {
    const params = jupiterOrderParams({
      side: "buy",
      inputMint: USDC_MINT,
      outputMint: AAPLX_MINT,
      amountRaw: BigInt(1_000_000),
      slippageBps: 50,
    });
    expect(params.has("taker")).toBe(false);
  });
});

describe("jupiterSwapUrl", () => {
  it("arma la URL del endpoint de orden", () => {
    const url = jupiterSwapUrl("https://api.jup.ag", "/swap/v2/order");
    expect(url).toBe("https://api.jup.ag/swap/v2/order");
  });

  it("no duplica la barra final del base", () => {
    const url = jupiterSwapUrl("https://api.jup.ag/", "/swap/v2/order");
    expect(url).toBe("https://api.jup.ag/swap/v2/order");
  });
});

describe("rawAmountToUi / uiAmountToRaw", () => {
  it("USDC (6 decimales)", () => {
    expect(rawAmountToUi(BigInt(1_000_000), 6)).toBe(1);
    expect(uiAmountToRaw(1, 6)).toBe(BigInt(1_000_000));
  });

  it("acciones con multiplicador Token-2022", () => {
    // rawAmountToUi(raw, 8, 4) = (raw / 1e8) * 4. Para que dé 1 acción
    // mostrada con multiplicador 4, el crudo es 0,25e8 = 25.000.000.
    expect(rawAmountToUi(BigInt(25_000_000), 8, 4)).toBe(1);
    expect(uiAmountToRaw(1, 8, 4)).toBe(BigInt(25_000_000));
  });

  it("ida y vuelta consistente", () => {
    const raw = uiAmountToRaw(12.34, 6);
    expect(rawAmountToUi(raw, 6)).toBeCloseTo(12.34, 6);
  });
});

describe("parseJupiterOrder", () => {
  const options: OrderParseOptions = {
    side: "buy",
    inputMint: USDC_MINT,
    outputMint: AAPLX_MINT,
    inputDecimals: 6,
    outputDecimals: 8,
    inputMultiplier: 1, // USDC no tiene multiplicador
    outputMultiplier: 4, // xStocks con multiplicador 4
    platformFeeBps: 0,
  };

  it("extrae montos, requestId e impacto", () => {
    const parsed = parseJupiterOrder(baseOrder(), options);
    expect(parsed.requestId).toBe("req_abc123");
    // inAmountUi: 1e6 crudos / 1e6 = 1 USDC.
    expect(parsed.inAmountUi).toBeCloseTo(1, 6);
    // outAmountUi: 2934 crudos / 1e8 * multiplicador 4 = 0,000117 acciones.
    expect(parsed.outAmountUi).toBeCloseTo((2934 / 1e8) * 4, 12);
    expect(parsed.priceImpactPct).toBeCloseTo(0.12, 6);
    expect(parsed.slippageBps).toBe(50);
    expect(parsed.platformFeeBps).toBe(0);
  });

  it("calcula el precio por acción del cruce", () => {
    // Precio por acción = USDC entrado / acciones recibidas.
    const parsed = parseJupiterOrder(baseOrder(), options);
    expect(parsed.pricePerShareUsd).toBeGreaterThan(0);
  });

  it("rechaza una respuesta sin requestId", () => {
    const bad = baseOrder();
    delete bad.requestId;
    expect(() => parseJupiterOrder(bad, options)).toThrow(/requestId/);
  });

  it("rechaza montos que no son strings numéricas", () => {
    const bad = baseOrder();
    bad.inAmount = "no-es-numero";
    expect(() => parseJupiterOrder(bad, options)).toThrow(/inAmount/);
  });

  it("acepta una orden RFQ sin routePlan pero con montos válidos", () => {
    // Ondo/JupiterZ: cotización RFQ. No trae routePlan AMM pero sí montos.
    const rfq: JupiterOrderLike = {
      requestId: "req_rfq",
      inputMint: USDC_MINT,
      outputMint: AAPLX_MINT,
      inAmount: "500000",
      outAmount: "1500",
      priceImpactPct: "0",
      slippageBps: 50,
      router: "jupiterz",
    };
    const parsed = parseJupiterOrder(rfq, options);
    expect(parsed.requestId).toBe("req_rfq");
    expect(parsed.inAmountUi).toBeCloseTo(0.5, 6);
    expect(parsed.isRfq).toBe(true);
  });
});
