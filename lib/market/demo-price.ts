import { quoteFor } from "@/lib/mocks/prices";

export interface SpotPrice {
  priceUsd: number;
}

/**
 * Precio de la demo. Si hay spot (el mismo de `/api/prices`), se usa ese.
 * Si no, la ancla. No mezcla las dos en una misma cifra.
 */
export function demoSpotPrice(symbol: string, spots?: ReadonlyMap<string, SpotPrice>): number {
  const price = spots?.get(symbol)?.priceUsd;
  if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
  return quoteFor(symbol).priceUsd;
}
