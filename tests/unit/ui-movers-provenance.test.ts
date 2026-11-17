import { describe, expect, it } from "vitest";
import { loadTodayBoard, todayBoardSchema, type OfferedName } from "@/lib/market/movers";
import type { HistoryMetadata } from "@/lib/types";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const asset = (symbol: string, liquidityUsd: number): OfferedName => ({
  symbol, name: symbol, logoUrl: null, underlying: symbol.replace(/x$/, ""), liquidityUsd,
});
const ticksMeta: HistoryMetadata = { instrument: "token", provider: "jupiter", resolution: "irregular",
  priceUnit: "usd_per_share", reference: false, capabilities: { ohlc: false, volume: false } };
const closesMeta: HistoryMetadata = { instrument: "underlying", provider: "yahoo", resolution: "1d",
  priceUnit: "usd_per_share", reference: true, capabilities: { ohlc: false, volume: false } };

describe("procedencia del tablero", () => {
  it("usa extremos efectivos para porcentaje y spark, con fuente de cada fila y sin alterar ranking", async () => {
    const calls: string[] = [];
    const board = await loadTodayBoard({
      listOffered: async () => [asset("UPx", 1), asset("DOWNx", 100), asset("UPx", 1)],
      readTicks: async (symbol) => {
        calls.push(`ticks:${symbol}`);
        if (symbol !== "UPx") return [];
        return { source: "ticks", metadata: ticksMeta, points: [
          { t: NOW - 2 * DAY, p: 50 }, { t: NOW - DAY / 2, p: 100 }, { t: NOW, p: 110 },
        ] };
      },
      readCloses: async (underlying) => {
        calls.push(`closes:${underlying}`);
        return underlying === "DOWN" ? { source: "closes", metadata: closesMeta, points: [
          { t: NOW - 3 * DAY, p: 100 }, { t: NOW - 2 * DAY, p: 80 }, { t: NOW - DAY, p: 70 },
        ] } : [];
      }, now: NOW, concurrency: 2,
    });
    expect(todayBoardSchema.parse(board)).toEqual(board);
    const up = board.gainers[0]!;
    expect(up.symbol).toBe("UPx");
    expect(up.changePct).toBe(0.1);
    expect(up.spark).toEqual([50, 100, 110]);
    expect(up.metadata).toMatchObject({ source: "ticks", provider: "jupiter", changeFrom: NOW - DAY / 2,
      changeTo: NOW, sparkFrom: NOW - 2 * DAY, sparkTo: NOW });
    const down = board.losers[0]!;
    expect(down.symbol).toBe("DOWNx");
    expect(down.changePct).toBe(-0.125);
    expect(down.spark).toEqual([100, 80, 70]);
    expect(down.metadata).toMatchObject({ source: "closes", provider: "yahoo", changeFrom: NOW - 2 * DAY,
      changeTo: NOW - DAY, sparkFrom: NOW - 3 * DAY, sparkTo: NOW - DAY });
    expect(board.viewed[0]?.symbol).toBe("UPx");
    expect(calls.filter((call) => call === "ticks:UPx")).toHaveLength(1);
    expect(calls).not.toContain("closes:UP");
    expect(calls).toHaveLength(5); // dos activos únicos y SPY; cierres sólo cuando faltan ticks.
  });

  it("acepta datos antiguos sin metadatos y rotula mock sólo si el proveedor lo declara", async () => {
    const board = await loadTodayBoard({ listOffered: async () => [asset("OLDx", 1), asset("DEMOx", 2)],
      readTicks: async (symbol) => symbol === "OLDx"
        ? [{ t: NOW - 1, p: 10 }, { t: NOW, p: 11 }]
        : symbol === "DEMOx" ? { source: "mock", points: [{ t: NOW - 1, p: 10 }, { t: NOW, p: 12 }] } : [],
      readCloses: async () => [], now: NOW,
    });
    expect(todayBoardSchema.parse(board)).toEqual(board);
    expect(board.gainers.find((card) => card.symbol === "OLDx")?.metadata).toBeUndefined();
    expect(board.gainers.find((card) => card.symbol === "DEMOx")?.metadata).toMatchObject({ source: "mock", changeFrom: NOW - 1, changeTo: NOW });
  });
});
