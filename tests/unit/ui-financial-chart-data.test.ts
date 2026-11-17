import { describe, expect, it } from "vitest";
import { chartCapabilities, chartPoints, compatibleSpot, observedSeries } from "@/lib/charts/data";
import { formatUnitPrice } from "@/lib/market/price-format";
import type { HistoryMetadata } from "@/lib/types";

const bar = { t: 1_000, p: 10, o: 9, h: 11, l: 8, c: 10, v: 100 };
const bars = [bar, { ...bar, t: 2_000, p: 11, c: 11 }];
const metadata: HistoryMetadata = {
  instrument: "underlying", provider: "yahoo", resolution: "1d", priceUnit: "usd_per_share", reference: true,
  capabilities: { ohlc: true, volume: true }, volumeUnit: "underlying_shares", volumeScope: "underlying_market",
};

describe("financial chart data", () => {
  it("orders and deduplicates seconds while retaining OHLCV", () => {
    expect(chartPoints([{ ...bar, t: 2_001 }, { ...bar, t: 1_500 }, { ...bar, t: 1_800, v: 120 }]))
      .toEqual([{ ...bar, t: 1_000, v: 120 }, { ...bar, t: 2_000 }]);
  });

  it("extends only compatible token ticks and never appends a quote to bars", () => {
    const quote = { source: "jupiter" as const, reference: false, priceUsd: 12, updatedAt: "2026-01-01T00:00:00Z" };
    const spot = compatibleSpot("ticks", quote);
    expect(spot).toEqual({ t: Date.parse(quote.updatedAt), p: 12 });
    expect(compatibleSpot("closes", quote)).toBeUndefined();
    expect(compatibleSpot("ticks", { ...quote, reference: true })).toBeUndefined();
    expect(observedSeries([{ t: 1_000, p: 10 }], spot)).toHaveLength(2);
    expect(observedSeries(bars, spot)).toEqual(bars);
    expect(observedSeries([{ t: 1_900, p: 10 }], { t: 1_500, p: 12 })).toEqual([{ t: 1_000, p: 10 }]);
    expect(observedSeries([{ t: 1_500, p: 10 }], { t: 1_900, p: 12 })).toEqual([{ t: 1_000, p: 12 }]);
  });

  it("requires valid bars, source metadata and underlying volume units", () => {
    expect(chartCapabilities(bars, metadata)).toEqual({ ohlc: true, volume: true });
    expect(chartCapabilities(bars)).toEqual({ ohlc: false, volume: false });
    expect(chartCapabilities(bars, { ...metadata, provider: "mixed" })).toEqual({ ohlc: false, volume: false });
    expect(chartCapabilities([{ ...bar, h: 8 }, bars[1]!], metadata).ohlc).toBe(false);
    expect(chartCapabilities([{ ...bar, v: undefined }, bars[1]!], metadata).volume).toBe(false);
    expect(chartCapabilities(bars, { ...metadata, volumeScope: undefined }).volume).toBe(false);
    expect(chartCapabilities([{ ...bar, gap: true }, bars[1]!], metadata)).toEqual({ ohlc: false, volume: false });
  });

  it("does not format a tiny positive unit price as zero", () => {
    expect(formatUnitPrice(1e-15, "USD")).toContain("E-15");
    expect(formatUnitPrice(1e-8, "CLP")).not.toMatch(/\$\s*0(?:,0+)?$/);
  });
});
