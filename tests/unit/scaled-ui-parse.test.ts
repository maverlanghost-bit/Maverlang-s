import { describe, expect, it, vi } from "vitest";

import { parseScaledUiAmountConfig } from "@/lib/solana/scaled-ui";

/**
 * El multiplicador vigente se decide con el mismo criterio que el programa
 * Token-2022, pero leyendo la extensión por `getParsedAccountInfo` (strings)
 * en vez de `getScaledUiAmountConfig` (BigInt), que falla contra el RPC con
 * "Do not know how to serialize a BigInt" en web3.js 1.99.
 * `parseScaledUiAmountConfig` es PURO: recibe lo que trae la cuenta parseada.
 */

const NOW = 1_800_000_000; // segundos unix fijos para los tests

describe("parseScaledUiAmountConfig", () => {
  it("usa newMultiplier cuando el timestamp ya pasó", () => {
    const state = {
      multiplier: "1.0",
      newMultiplier: "1.0032690125398187",
      newMultiplierEffectiveTimestamp: "1786149000", // < NOW
    };
    expect(parseScaledUiAmountConfig(state, NOW)).toBeCloseTo(1.0032690125398187, 12);
  });

  it("mantiene multiplier cuando el timestamp es futuro", () => {
    const state = {
      multiplier: "1.0",
      newMultiplier: "1.5",
      newMultiplierEffectiveTimestamp: "1900000000", // > NOW
    };
    expect(parseScaledUiAmountConfig(state, NOW)).toBe(1.0);
  });

  it("acepta números (no sólo strings)", () => {
    const state = {
      multiplier: 1,
      newMultiplier: 2,
      newMultiplierEffectiveTimestamp: 1786149000,
    };
    expect(parseScaledUiAmountConfig(state, NOW)).toBe(2);
  });

  it("timestamp undefined => mantiene multiplier (no revienta)", () => {
    const state = { multiplier: "1.2", newMultiplier: "1.3" };
    expect(parseScaledUiAmountConfig(state, NOW)).toBeCloseTo(1.2, 12);
  });

  it("estado vacío o inválido => 1 (fallback seguro)", () => {
    expect(parseScaledUiAmountConfig(null, NOW)).toBe(1);
    expect(parseScaledUiAmountConfig({}, NOW)).toBe(1);
  });

  it("multiplicador no positivo => 1 (fallback seguro)", () => {
    const state = { multiplier: "0", newMultiplier: "0", newMultiplierEffectiveTimestamp: "1786149000" };
    expect(parseScaledUiAmountConfig(state, NOW)).toBe(1);
  });
});
