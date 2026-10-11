import { describe, expect, it } from "vitest";

import {
  coingeckoSymbol,
  fetchCoinGeckoHistory,
  resolveCoinGeckoId,
} from "@/lib/market/coingecko-history";

/**
 * Tests del backfill de historial real (CoinGecko xStocks). `fetchImpl` se
 * inyecta: NO toca la red. Fija el mapeo de símbolo, la resolución de id por
 * categoría y el parseo de `market_chart` a PricePoint.
 */

const MARKETS = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=xstocks-ecosystem&per_page=250&page=1";
const CHART = "https://api.coingecko.com/api/v3/coins/apple-xstock/market_chart?vs_currency=usd&days=365&interval=daily";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("coingeckoSymbol", () => {
  it("pasa el símbolo de Maverlang al de CoinGecko (minúsculas)", () => {
    expect(coingeckoSymbol("AAPLx")).toBe("aaplx");
    expect(coingeckoSymbol(" NVDAx ")).toBe("nvdax");
  });
});

describe("resolveCoinGeckoId", () => {
  it("encuentra el id por símbolo en la categoría xstocks", async () => {
    const fetchImpl = async (input: string) => {
      if (input === MARKETS) {
        return json([
          { id: "tesla-xstock", symbol: "tslax", current_price: 250 },
          { id: "apple-xstock", symbol: "aaplx", current_price: 230 },
        ]);
      }
      return json({}, 404);
    };
    expect(await resolveCoinGeckoId("AAPLx", { fetchImpl: fetchImpl as typeof fetch })).toBe("apple-xstock");
  });

  it("devuelve null si el símbolo no está listado", async () => {
    const fetchImpl = async (input: string) => {
      if (input === MARKETS) return json([{ id: "apple-xstock", symbol: "aaplx", current_price: 230 }]);
      return json({}, 404);
    };
    expect(await resolveCoinGeckoId("ZZZZx", { fetchImpl: fetchImpl as typeof fetch })).toBeNull();
  });

  it("devuelve null si la red falla (no rompe el backfill)", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    expect(await resolveCoinGeckoId("AAPLx", { fetchImpl: fetchImpl as typeof fetch })).toBeNull();
  });
});

describe("fetchCoinGeckoHistory", () => {
  it("parsea prices a PricePoint y descarta valores inválidos", async () => {
    const fetchImpl = async (input: string) => {
      if (input === MARKETS) return json([{ id: "apple-xstock", symbol: "aaplx", current_price: 230 }]);
      if (input === CHART) {
        return json({
          prices: [
            [1700000000000, 228.4],
            [1700086400000, 231.2],
            [1700172800000, 0], // inválido: precio no positivo
            [1700259200000, Number.NaN], // inválido: no finito
            [1700345600000, 229.8],
          ],
        });
      }
      return json({}, 404);
    };
    const result = await fetchCoinGeckoHistory("AAPLx", { fetchImpl: fetchImpl as typeof fetch });
    expect(result).not.toBeNull();
    expect(result?.symbol).toBe("AAPLx");
    expect(result?.points).toEqual([
      { t: 1700000000000, p: 228.4 },
      { t: 1700086400000, p: 231.2 },
      { t: 1700345600000, p: 229.8 },
    ]);
  });

  it("devuelve null con menos de dos puntos válidos", async () => {
    const fetchImpl = async (input: string) => {
      if (input === MARKETS) return json([{ id: "apple-xstock", symbol: "aaplx", current_price: 230 }]);
      if (input === CHART) return json({ prices: [[1700000000000, 228.4]] });
      return json({}, 404);
    };
    expect(await fetchCoinGeckoHistory("AAPLx", { fetchImpl: fetchImpl as typeof fetch })).toBeNull();
  });

  it("devuelve null si CoinGecko responde 429 (rate limit)", async () => {
    const fetchImpl = async (input: string) => {
      if (input === MARKETS) return json([{ id: "apple-xstock", symbol: "aaplx", current_price: 230 }]);
      return json({ error: "rate limited" }, 429);
    };
    expect(await fetchCoinGeckoHistory("AAPLx", { fetchImpl: fetchImpl as typeof fetch })).toBeNull();
  });
});
