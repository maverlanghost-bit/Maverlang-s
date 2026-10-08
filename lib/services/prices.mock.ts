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
  if (ticker) return ticker.symbol;
  // Mock permisivo (M54): la ancla cubre cualquier símbolo bien formado, así
  // el e2e puede usar un fixture amplio. En live la ruta ya filtra por visible.
  const wanted = symbol.trim();
  if (/^[A-Za-z0-9.]{1,12}x$/.test(wanted)) return wanted;
  throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
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
