import "server-only";

import { ENABLED_TICKERS, tickerBySymbol } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { mockFx } from "@/lib/mocks/fx";
import { simulateMock } from "@/lib/mocks/latency";
import { mockMarketStatus } from "@/lib/mocks/market";
import { priceHistory, quoteFor } from "@/lib/mocks/prices";
import type { FxRate, MarketStatus, PricePoint, Quote, Range } from "@/lib/types";

function canonicalSymbol(symbol: string): string {
  const ticker = tickerBySymbol(symbol);
  if (!ticker) throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
  return ticker.symbol;
}

export const mockPrices = {
  async list(symbols: string[]): Promise<Quote[]> {
    const key = symbols.join(",") || "all";
    return simulateMock(`prices:${key}`, () => {
      const wanted = symbols.length > 0 ? symbols : ENABLED_TICKERS.map((ticker) => ticker.symbol);
      return wanted.map((symbol) => quoteFor(canonicalSymbol(symbol)));
    });
  },

  async history(symbol: string, range: Range): Promise<PricePoint[]> {
    return simulateMock(`history:${symbol}:${range}`, () => priceHistory(canonicalSymbol(symbol), range));
  },

  async fx(): Promise<FxRate> {
    return simulateMock("fx", () => mockFx());
  },

  async market(): Promise<MarketStatus> {
    return simulateMock("market", () => mockMarketStatus());
  },
};
