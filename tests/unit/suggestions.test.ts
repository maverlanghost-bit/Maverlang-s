import { describe, expect, it } from "vitest";

import { topSuggestions } from "@/lib/market/browse";
import type { Quote } from "@/lib/types";

function quote(symbol: string, priceUsd: number, change24hPct: number): Quote {
  return {
    symbol,
    priceUsd,
    change24hPct,
    multiplier: 1,
    updatedAt: new Date(1_700_000_000_000).toISOString(),
    source: "mock",
  };
}

function row(symbol: string, priceUsd: number, change24hPct = 1.5) {
  return {
    item: { symbol, name: `Nombre ${symbol}`, underlying: symbol.replace(/x$/, ""), logoUrl: null },
    quote: quote(symbol, priceUsd, change24hPct),
  };
}

describe("N20: topSuggestions", () => {
  it("devuelve hasta 6 en orden, con precio y variación", () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`S${index}Mx`, 10 + index));
    const out = topSuggestions(rows, "USD", undefined);
    expect(out).toHaveLength(6);
    expect(out[0]).toMatchObject({ symbol: "S0Mx", price: 10, currency: "USD", change: 1.5 });
    expect(out[5]?.symbol).toBe("S5Mx");
  });

  it("convierte a CLP con tipo de cambio y cae a USD sin él", () => {
    const rows = [row("AAPx", 100)];
    expect(topSuggestions(rows, "CLP", 900)).toMatchObject([{ price: 90_000, currency: "CLP" }]);
    expect(topSuggestions(rows, "CLP", undefined)).toMatchObject([{ price: 100, currency: "USD" }]);
  });

  it("omite sin precio visible y variación no finita queda null", () => {
    const rows = [row("BADx", Number.NaN, Number.NaN), row("AAPx", 100, Number.NaN)];
    const out = topSuggestions(rows, "USD", undefined);
    expect(out.map((entry) => entry.symbol)).toEqual(["AAPx"]);
    expect(out[0]?.change).toBeNull();
  });
});
