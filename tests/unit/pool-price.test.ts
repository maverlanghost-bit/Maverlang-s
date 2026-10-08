import { describe, expect, it } from "vitest";

import { parseJupiterPrices } from "@/lib/market/live-quotes";
import { fetchMintBatch, type MintBatchOptions } from "@/lib/market/price-batcher";
import {
  POOL_DISLOCATION_ALERT_PCT,
  poolDislocated,
  poolDislocationPct,
} from "@/lib/market/dislocation";

const NOW = 1_700_000_000_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("N15: Jupiter trae liquidez y precio del subyacente", () => {
  it("parse captura liquidity y stockData.price", () => {
    const rows = parseJupiterPrices({
      MintA: { usdPrice: 72.0, priceChange24h: 3.3, liquidity: 747.7, stockData: { price: 69.08 } },
      MintB: { usdPrice: 10 },
    });
    expect(rows.get("MintA")).toMatchObject({
      usdPrice: 72,
      changeKnown: true,
      liquidityUsd: 747.7,
      marketPriceUsd: 69.08,
    });
    expect(rows.get("MintB")).toMatchObject({ usdPrice: 10, changeKnown: false, changeRatio: 0 });
    expect(rows.get("MintB")).not.toHaveProperty("marketPriceUsd");
  });
  it("el batcher pasa mercado y liquidez hasta la quote", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        MintA: { usdPrice: 72.0, priceChange24h: 3.3, liquidity: 747.7, stockData: { price: 69.08 } },
      })) as typeof fetch;
    const out = await fetchMintBatch(["MintA"], {
      priceUrl: "https://api.jup.ag/price/v3",
      fetchImpl,
      timeoutMs: 50,
      now: () => NOW,
      sleep: async () => {},
    } satisfies MintBatchOptions);
    expect(out.get("MintA")).toMatchObject({
      usdPrice: 72,
      liquidityUsd: 747.7,
      marketPriceUsd: 69.08,
      stale: false,
    });
  });
});

describe("N15: despegue pozo vs mercado", () => {
  it("UBERx real despega ~4% y avisa", () => {
    const pct = poolDislocationPct(72.00447544043718, 69.0786);
    expect(pct).toBeCloseTo(0.0424, 3);
    expect(poolDislocated(72.00447544043718, 69.0786)).toBe(true);
  });
  it("bajo el 1% no avisa y sin datos no rompe", () => {
    expect(POOL_DISLOCATION_ALERT_PCT).toBe(0.01);
    expect(poolDislocated(100, 99.5)).toBe(false);
    expect(poolDislocated(100, undefined)).toBe(false);
    expect(poolDislocationPct(0, 69)).toBeNull();
    expect(poolDislocationPct(72, 0)).toBeNull();
  });
});
