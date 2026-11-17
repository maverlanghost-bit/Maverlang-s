import { afterEach, describe, expect, it, vi } from "vitest";

import { historyFields, historyResponseSchema, pricePointSchema } from "@/lib/api/contracts";
import { fetchYahooChartHistory, parseYahooChartSeries } from "@/lib/market/underlying-move";
import { scaleCloses } from "@/lib/services/history-series";
import type { HistoryMetadata } from "@/lib/types";

function yahoo(currency = "USD", instrumentType = "EQUITY") {
  return { chart: { result: [{ meta: { currency, instrumentType, dataGranularity: "1d" },
    timestamp: [1_700_000_000, 1_700_086_400, 1_700_172_800],
    indicators: { quote: [{ open: [10, 12, null], high: [13, 15, 12], low: [9, 11, 10],
      close: [12, 14, 11], volume: [500, 0, null] }] } }] } };
}

const metadata: HistoryMetadata = {
  instrument: "underlying", provider: "yahoo", providerSymbol: "AAA", resolution: "1d",
  priceUnit: "usd_per_share", reference: true, priceAdjustment: "provider_quote",
  volumeUnit: "underlying_shares", volumeScope: "underlying_market",
  capabilities: { ohlc: true, volume: true },
};

afterEach(() => vi.unstubAllGlobals());

describe("observaciones OHLCV del subyacente", () => {
  it("empareja la misma barra y deja ausentes las magnitudes que no llegaron", () => {
    expect(parseYahooChartSeries(yahoo())).toEqual([
      { t: 1_700_000_000_000, p: 12, o: 10, h: 13, l: 9, c: 12, v: 500 },
      { t: 1_700_086_400_000, p: 14, o: 12, h: 15, l: 11, c: 14, v: 0 },
      { t: 1_700_172_800_000, p: 11 },
    ]);
    const invalid = { chart: { result: [{ timestamp: [1, 2, 3, 4], indicators: { quote: [{
      close: [10, 0, 12, 15], open: [11, 1, 12, 14], high: [10, 2, 13, 16],
      low: [9, 1, 11, 13], volume: [-1, 3, null, 8],
    }] } }] } };
    expect(parseYahooChartSeries(invalid)).toEqual([
      { t: 1000, p: 10 }, { t: 3000, p: 12, o: 12, h: 13, l: 11, c: 12 },
      { t: 4000, p: 15, o: 14, h: 16, l: 13, c: 15, v: 8 },
    ]);
    expect(parseYahooChartSeries(null)).toEqual([]);
  });

  it("acepta USD conocido y rechaza otra moneda sin hacer HTTP real", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(yahoo()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(yahoo("EUR")), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(yahoo("USD", "UNKNOWN")), { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    const usd = await fetchYahooChartHistory("GTESTUSD", "1M");
    const eur = await fetchYahooChartHistory("GTESTEUR", "1M");
    const unknownVolume = await fetchYahooChartHistory("GTESTUNKNOWN", "1M");
    expect(usd.points).toEqual(parseYahooChartSeries(yahoo()));
    expect(usd.metadata).toMatchObject({ provider: "yahoo", instrument: "underlying", resolution: "1d", reference: true });
    expect(eur.points).toEqual([]);
    expect(unknownVolume.points.every((point) => point.v === undefined)).toBe(true);
    expect(unknownVolume.metadata.capabilities.volume).toBe(false);
    expect(fetchStub).toHaveBeenCalledTimes(3);
  });

  it("escala precios, conserva volumen y transporta sólo barras y capacidades sustentadas", () => {
    const observed = parseYahooChartSeries(yahoo()).slice(0, 2);
    const scaled = scaleCloses(observed, 0.5);
    expect(scaled[0]).toEqual({ t: 1_700_000_000_000, p: 6, o: 5, h: 6.5, l: 4.5, c: 6, v: 500 });
    expect(scaled[1]?.v).toBe(0);
    const response = historyResponseSchema.parse(historyFields(scaled, "closes", { ...metadata, multiplier: 0.5 }));
    expect(response.points).toEqual(scaled);
    expect(response.metadata).toMatchObject({ multiplier: 0.5, capabilities: { ohlc: true, volume: true } });
    const incomplete = historyResponseSchema.parse(historyFields([...scaled, { t: 1_700_172_800_000, p: 5.5 }], "closes", metadata));
    expect(incomplete.metadata?.capabilities).toEqual({ ohlc: false, volume: false });
    expect(incomplete.points[2]).toEqual({ t: 1_700_172_800_000, p: 5.5 });
    const ticks = historyResponseSchema.parse(historyFields(scaled, "ticks", { ...metadata, instrument: "token" }));
    expect(ticks.points[0]).toEqual({ t: scaled[0]!.t, p: 6 });
    expect(ticks.metadata?.capabilities).toEqual({ ohlc: false, volume: false });
    const wrongUnit = historyResponseSchema.parse(historyFields(scaled, "closes", { ...metadata, priceUnit: "usd_per_token" }));
    expect(wrongUnit.metadata?.capabilities).toEqual({ ohlc: false, volume: false });
    expect(pricePointSchema.safeParse({ t: 1, p: 10, o: 9 }).success).toBe(false);
  });
});
