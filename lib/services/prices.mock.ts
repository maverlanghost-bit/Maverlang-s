import "server-only";

import { ENABLED_TICKERS, tickerBySymbol } from "@/config/tickers";
import { isCryptoSymbol } from "@/lib/catalog/crypto";
import { isEarnSymbol } from "@/lib/catalog/lst";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { DomainError } from "@/lib/api/result";
import { mockFx } from "@/lib/mocks/fx";
import { simulateMock } from "@/lib/mocks/latency";
import { mockMarketStatus } from "@/lib/mocks/market";
import { priceHistory, quoteFor } from "@/lib/mocks/prices";
import type { FxRate, MarketStatus, PricePoint, Quote, Range } from "@/lib/types";

/** Cripto/LST no tienen ancla mock: se omiten (la UI muestra "sin precio"), nunca se inventa uno. */
function isCryptoOrEarn(symbol: string): boolean {
  return isCryptoSymbol(symbol) || isEarnSymbol(symbol);
}

function canonicalSymbol(symbol: string): string | null {
  const ticker = tickerBySymbol(symbol);
  if (ticker) return ticker.symbol;
  const wanted = symbol.trim();
  if (isCryptoOrEarn(wanted)) return null;
  // Mock permisivo (M54): la ancla cubre cualquier símbolo bien formado, así
  // el e2e puede usar un fixture amplio. En live la ruta ya filtra por visible.
  if (isCatalogSymbol(wanted)) return wanted;
  throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
}

export const mockPrices = {
  async list(symbols: string[]): Promise<Quote[]> {
    const key = symbols.join(",") || "all";
    return simulateMock(`prices:${key}`, () => {
      const wanted = symbols.length > 0 ? symbols : ENABLED_TICKERS.map((ticker) => ticker.symbol);
      return wanted
        .map((symbol) => canonicalSymbol(symbol))
        .filter((symbol): symbol is string => symbol !== null)
        .map((symbol) => quoteFor(symbol));
    });
  },

  async history(symbol: string, range: Range): Promise<PricePoint[]> {
    const canonical = canonicalSymbol(symbol);
    // Sin price_ticks de cripto en esta tanda: "sin historial", no una serie inventada.
    if (canonical === null) return [];
    return simulateMock(`history:${symbol}:${range}`, () => priceHistory(canonical, range));
  },

  async fx(): Promise<FxRate> {
    return simulateMock("fx", () => mockFx());
  },

  async market(): Promise<MarketStatus> {
    return simulateMock("market", () => mockMarketStatus());
  },
};
