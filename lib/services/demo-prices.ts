import "server-only";

import { serverEnv } from "@/lib/env";
import { mockFx } from "@/lib/mocks/fx";
import { quoteFor } from "@/lib/mocks/prices";
import { livePrices } from "@/lib/services/prices.live";
import type { Quote } from "@/lib/types";

/** Con `PRICES_MODE=live`, el mismo cache de Jupiter. Si no, la ancla, sin red. */
export async function demoSpot(symbol: string): Promise<Quote> {
  if (serverEnv.PRICES_MODE !== "live") return quoteFor(symbol);
  const quotes = await livePrices.list([symbol]);
  return quotes[0] ?? quoteFor(symbol);
}

/** Mapa vacío en mock: los callers caen a la ancla. */
export async function demoSpotBook(symbols: readonly string[]): Promise<Map<string, Quote>> {
  const unique = [...new Set(symbols)];
  if (serverEnv.PRICES_MODE !== "live" || unique.length === 0) return new Map();
  const quotes = await livePrices.list(unique);
  return new Map(quotes.map((quote) => [quote.symbol, quote]));
}

/**
 * Dólar de la demo. En mock es 950. En live es mindicador.
 * Si la fuente live falla, rechaza: no devuelve 950.
 */
export async function demoFxRate(): Promise<number> {
  if (serverEnv.PRICES_MODE !== "live") return mockFx().rate;
  const fx = await livePrices.fx();
  return fx.rate;
}
