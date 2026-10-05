import type { FxRate } from "@/lib/types";

/**
 * Dólar de relleno para el demo. No es el dólar observado.
 * source queda en "mock" a propósito.
 */
export const MOCK_USDCLP = 950;

const UPDATED_AT = "2026-10-05T12:00:00.000Z";

export function mockFx(now = UPDATED_AT): FxRate {
  return {
    pair: "USDCLP",
    rate: MOCK_USDCLP,
    source: "mock",
    updatedAt: now,
  };
}
