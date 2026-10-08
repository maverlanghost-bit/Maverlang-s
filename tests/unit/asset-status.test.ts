import { describe, expect, it, beforeEach } from "vitest";

import { formatReopenWhen } from "@/lib/format";
import {
  __clearAssetStatusCacheForTests,
  chipKeyForStatus,
  effectiveMinOrderUsd,
  normalizeMode,
  normalizePeriod,
  status,
  tradeBlockForStatus,
  type AssetStatus,
} from "@/lib/market/asset-status";
import type { CatalogAsset } from "@/lib/catalog/assets";

function catalogAsset(patch: Partial<CatalogAsset> & { symbol: string }): CatalogAsset {
  return {
    name: patch.symbol,
    underlying: patch.symbol.replace(/x$/i, ""),
    category: "tech",
    mint: `mint-${patch.symbol}`,
    logoLocal: null,
    enabled: true,
    halted: false,
    liquidityUsd: null,
    curated: true,
    issuer: "xstocks",
    companyTicker: patch.symbol.replace(/x$/i, ""),
    buy100CostBps: null,
    mode: null,
    period: null,
    openNow: null,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
    safetyStatus: "listed",
    safetyReasons: [],
    safetyTier: null,
    safetyCheckedAt: null,
    tradable: true,
    underReview: false,
    transitionKept: false,
    ...patch,
  };
}

function liveFetch(assetBody: unknown, systemBody: unknown = null) {
  return (async (url: string | URL) => {
    const href = String(url);
    if (href.includes("/system/status/")) {
      return new Response(JSON.stringify(systemBody ?? {}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(assetBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __clearAssetStatusCacheForTests();
});

describe("horario real por acción (M39)", () => {
  it("mapea períodos a chips: market, extended, overnight, closed y halted", () => {
    const base: AssetStatus = {
      mode: "TwentyFourFive",
      period: "market",
      openNow: true,
      nextChangeAt: null,
      halted: false,
      minOrderUsd: 10,
      maxOrderUsd: null,
      source: "live",
      updatedAt: new Date().toISOString(),
    };
    expect(chipKeyForStatus(base)).toBe("market");
    expect(chipKeyForStatus({ ...base, period: "extended" })).toBe("extended");
    expect(chipKeyForStatus({ ...base, period: "overnight" })).toBe("overnight");
    expect(chipKeyForStatus({ ...base, period: "closed", openNow: false })).toBe("closed");
    expect(chipKeyForStatus({ ...base, period: "market", openNow: false })).toBe("closed");
    expect(chipKeyForStatus({ ...base, halted: true })).toBe("halted");
  });

  it("normaliza modo y período de xStocks", () => {
    expect(normalizeMode("TwentyFourFive")).toBe("TwentyFourFive");
    expect(normalizeMode("MarketHours")).toBe("MarketHours");
    expect(normalizeMode("Regular")).toBe("Regular");
    expect(normalizeMode("otro")).toBe("unknown");
    expect(normalizePeriod("market")).toBe("market");
    expect(normalizePeriod("extended")).toBe("extended");
    expect(normalizePeriod("overnight")).toBe("overnight");
    expect(normalizePeriod("closed")).toBe("closed");
    expect(normalizePeriod("premarket")).toBe("extended");
    expect(normalizePeriod("desconocido")).toBe("unknown");
  });

  it("formatea nextChangeAt en America/Santiago (fecha fija)", () => {
    // Lunes 2026-10-05 12:00 UTC = 09:00 en Santiago (UTC-3 en octubre).
    expect(formatReopenWhen("2026-10-05T12:00:00.000Z", "es-CL")).toBe("lunes 09:00");
    expect(formatReopenWhen("2026-10-05T12:00:00.000Z", "en")).toBe("Monday 09:00");
    expect(formatReopenWhen("no-es-fecha", "es-CL")).toBeNull();
  });

  it("live convierte límites de centavos a USD y marca halted del sistema", async () => {
    const assetBody = {
      symbol: "AAPLx",
      isTradingHalted: false,
      trading: {
        tradingHoursMode: "TwentyFourFive",
        isTradingHalted: false,
        currentPeriod: "market",
        openNow: true,
        nextChangeAt: "2026-10-06T20:00:00.000Z",
        limitsPerPeriod: { market: { minOrderFiatValue: 1000, maxOrderFiatValue: 500000 } },
      },
    };
    const result = await status("AAPLx", {
      fetchImpl: liveFetch(assetBody, { symbol: "AAPLx", isMarketTradingHalted: true }),
      findAsset: async () => null,
      now: () => Date.parse("2026-10-06T12:00:00.000Z"),
      live: true,
    });
    expect(result).toMatchObject({
      mode: "TwentyFourFive",
      period: "market",
      openNow: true,
      halted: true,
      minOrderUsd: 10,
      maxOrderUsd: 5000,
      source: "live",
    });
  });

  it("si live falla usa el catálogo, y si no hay catálogo usa el mock", async () => {
    const failing = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    const catalog = catalogAsset({
      symbol: "AAPLx",
      mode: "MarketHours",
      period: "closed",
      openNow: false,
      nextChangeAt: "2026-10-06T13:30:00.000Z",
      minOrderUsd: 10,
      maxOrderUsd: null,
    });
    const fromCatalog = await status("AAPLx", {
      fetchImpl: failing,
      findAsset: async () => catalog,
      now: () => Date.parse("2026-10-06T12:00:00.000Z"),
      live: true,
    });
    expect(fromCatalog).toMatchObject({
      mode: "MarketHours",
      period: "closed",
      openNow: false,
      halted: false,
      minOrderUsd: 10,
      source: "catalog",
    });

    __clearAssetStatusCacheForTests();
    const fromMock = await status("AAPLx", {
      fetchImpl: failing,
      findAsset: async () => null,
      now: () => Date.parse("2026-10-03T16:00:00.000Z"),
      live: true,
    });
    expect(fromMock.source).toBe("mock");
    expect(fromMock.halted).toBe(false);
  });

  it("halted deshabilita la orden y el mínimo efectivo cae a US$1 sin dato", () => {
    expect(tradeBlockForStatus({ halted: true })).toBe("halted");
    expect(tradeBlockForStatus({ halted: false })).toBeNull();
    expect(effectiveMinOrderUsd(10)).toBe(10);
    expect(effectiveMinOrderUsd(null)).toBe(1);
    expect(effectiveMinOrderUsd(0)).toBe(1);
  });
});
