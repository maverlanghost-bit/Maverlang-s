import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { hoyCopy, hoyExtra } from "@/content/i18n/extra-hoy";
import {
  dayChange,
  dayWindow,
  formatChileClock,
  loadTodayBoard,
  mapPool,
  marketPhase,
  MOVERS_LIMIT,
  rankBoards,
  SPY_SYMBOL,
  todayBoardSchema,
  type OfferedName,
} from "@/lib/market/movers";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-28T15:00:00.000Z");
const ROOT = path.resolve(__dirname, "..", "..");

function named(
  symbol: string,
  liquidityUsd: number | null,
  underlying = symbol.replace(/x$/, ""),
): OfferedName {
  return { symbol, name: symbol, logoUrl: null, underlying, liquidityUsd };
}

describe("variación del día", () => {
  it("con cierres usa los dos últimos, no toda la ventana", () => {
    const points = [
      { t: 1, p: 100 },
      { t: 2, p: 200 },
      { t: 3, p: 150 },
    ];
    expect(dayWindow(points, NOW, true).map((point) => point.p)).toEqual([200, 150]);
    expect(dayChange(points, NOW, true)).toBe(-0.25);
  });

  it("con ticks usa las últimas 24 h y deja fuera el día anterior", () => {
    const points = [
      { t: NOW - 2 * DAY, p: 10 },
      { t: NOW - 60 * 60 * 1000, p: 20 },
      { t: NOW, p: 22 },
    ];
    expect(dayChange(points, NOW, false)).toBeCloseTo(0.1);
  });

  it("ordena puntos desordenados y no inventa un cambio con un solo precio", () => {
    expect(dayChange([{ t: 5, p: 110 }, { t: 1, p: 100 }], NOW, true)).toBeCloseTo(0.1);
    expect(dayChange([{ t: NOW, p: 10 }], NOW, false)).toBeNull();
    expect(dayChange([{ t: NOW, p: 0 }, { t: NOW + 1, p: 10 }], NOW, false)).toBeNull();
  });
});

describe("fase del mercado", () => {
  it("separa abierto, premercado, tras el cierre y cerrado", () => {
    expect(marketPhase("regular", new Date("2026-10-28T15:00:00Z"))).toBe("open");
    expect(marketPhase("offHours", new Date("2026-10-28T12:00:00Z"))).toBe("pre");
    expect(marketPhase("offHours", new Date("2026-10-28T13:29:00Z"))).toBe("pre");
    expect(marketPhase("offHours", new Date("2026-10-28T20:00:00Z"))).toBe("after");
    expect(marketPhase("closed", new Date("2026-10-28T15:00:00Z"))).toBe("closed");
  });

  it("muestra la hora de Chile", () => {
    expect(formatChileClock(new Date("2026-10-28T15:00:00Z"), "es-CL")).toBe("12:00");
    expect(formatChileClock(new Date("2026-10-28T15:00:00Z"), "en")).toBe("12:00");
  });
});

describe("listas", () => {
  it("toma los 5 que más suben, los 5 que más bajan y desempata vistos por liquidez", () => {
    const rows = [
      { symbol: "Bx", name: "B", logoUrl: null, changePct: 0.2, spark: [1, 2], observations: 4, liquidityUsd: 1 },
      { symbol: "Ax", name: "A", logoUrl: null, changePct: 0.5, spark: [1, 2], observations: 4, liquidityUsd: 1 },
      { symbol: "Cx", name: "C", logoUrl: null, changePct: 0.01, spark: [1, 2], observations: 9, liquidityUsd: 1 },
      { symbol: "Dx", name: "D", logoUrl: null, changePct: -0.3, spark: [2, 1], observations: 4, liquidityUsd: 50 },
      { symbol: "Ex", name: "E", logoUrl: null, changePct: -0.1, spark: [2, 1], observations: 1, liquidityUsd: 9 },
      { symbol: "Fx", name: "F", logoUrl: null, changePct: 0, spark: [1, 1], observations: 4, liquidityUsd: 80 },
      { symbol: "Gx", name: "G", logoUrl: null, changePct: 0.05, spark: [1, 2], observations: 4, liquidityUsd: 3 },
      { symbol: "Hx", name: "H", logoUrl: null, changePct: 0.04, spark: [1, 2], observations: 4, liquidityUsd: 3 },
      { symbol: "Ix", name: "I", logoUrl: null, changePct: 0.03, spark: [1, 2], observations: 4, liquidityUsd: 3 },
    ];
    const board = rankBoards(rows, MOVERS_LIMIT);
    expect(board.gainers.map((row) => row.symbol)).toEqual(["Ax", "Bx", "Gx", "Hx", "Ix"]);
    expect(board.losers.map((row) => row.symbol)).toEqual(["Dx", "Ex"]);
    expect(board.viewed.map((row) => row.symbol)).toEqual(["Cx", "Fx", "Dx", "Gx", "Hx"]);
    expect(board.gainers).toHaveLength(MOVERS_LIMIT);
    expect(board.gainers.some((row) => row.changePct <= 0)).toBe(false);
    expect(board.losers.some((row) => row.changePct >= 0)).toBe(false);
  });
});

describe("armado con ticks y cierres", () => {
  const closes = new Map<string, { t: number; p: number }[]>([
    ["UP", [{ t: NOW - DAY, p: 50 }, { t: NOW, p: 10 }]],
    ["DOWN", [{ t: NOW - 2 * DAY, p: 80 }, { t: NOW - DAY, p: 40 }]],
    ["BOOM", [{ t: NOW - 2 * DAY, p: 10 }, { t: NOW - DAY, p: 30 }]],
    ["SPY", [{ t: NOW - 2 * DAY, p: 100 }, { t: NOW - DAY, p: 101 }]],
  ]);

  async function board(offered: OfferedName[]) {
    return loadTodayBoard({
      listOffered: async () => offered,
      readTicks: async (symbol) => {
        if (symbol === "BOOMx") throw new Error("timeout");
        if (symbol === "UPx") return [{ t: NOW - 1000, p: 100 }, { t: NOW, p: 110 }];
        if (symbol === "FLATx") return [{ t: NOW - 1000, p: 10 }, { t: NOW, p: 10 }];
        return [];
      },
      readCloses: async (underlying) => closes.get(underlying) ?? [],
      now: NOW,
      concurrency: 2,
    });
  }

  it("prefiere ticks, cae a cierres y agrega SPYx si no está en la lista", async () => {
    const result = await board([
      named(" UPx ", 1),
      named("UPx", 1),
      named("DOWNx", 500),
      named("FLATx", 2),
      named("BOOMx", 3),
    ]);
    expect(todayBoardSchema.safeParse(result).success).toBe(true);
    expect(result.gainers.map((row) => row.symbol)).toEqual(["BOOMx", "UPx", SPY_SYMBOL]);
    expect(result.gainers.find((row) => row.symbol === "UPx")?.changePct).toBeCloseTo(0.1);
    expect(result.losers.map((row) => row.symbol)).toEqual(["DOWNx"]);
    expect(result.losers[0]?.changePct).toBeCloseTo(-0.5);
    expect(result.viewed.map((row) => row.symbol)).toEqual(["FLATx", "UPx", "DOWNx", "BOOMx", SPY_SYMBOL]);
    expect(result.spy?.symbol).toBe(SPY_SYMBOL);
    expect(result.spy?.changePct).toBeCloseTo(0.01);
    expect(result.spy?.spark.length).toBeGreaterThanOrEqual(2);
  });

  it("sin fichas igual pide la serie de SPYx", async () => {
    const result = await board([]);
    expect(result.spy?.symbol).toBe(SPY_SYMBOL);
    expect(result.gainers.map((row) => row.symbol)).toEqual([SPY_SYMBOL]);
  });
});

describe("mapPool", () => {
  it("conserva el orden con concurrencia", async () => {
    const out = await mapPool([1, 2, 3], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 20 : 0));
      return value * 10;
    });
    expect(out).toEqual([10, 20, 30]);
  });
});

describe("textos y contrato", () => {
  it("es-CL y en tienen las mismas claves y no recomiendan", () => {
    expect(Object.keys(hoyExtra.esCL).sort()).toEqual(Object.keys(hoyExtra.en).sort());
    expect(hoyCopy("es-CL").title).toBe("Tu día");
    expect(hoyCopy("es-CL").gainers).toBe("Más suben");
    expect(hoyCopy("es-CL").losers).toBe("Más bajan");
    expect(hoyCopy("es-CL").viewed).toBe("Más vistos");
    expect(hoyCopy("es-CL").spy).toBe("S&P 500");
    expect(hoyCopy("en").gainers).toBe("Top gainers");
    const banned = ["oportunidad", "recomend", "conviene", "imperdible", "compra ya"];
    const blob = `${JSON.stringify(hoyExtra)} ${readFileSync(path.join(ROOT, "components/domain/market-today/market-today.tsx"), "utf8")}`;
    for (const word of banned) expect(blob.toLowerCase()).not.toContain(word);
  });

  it("la ruta cachea con s-maxage 60 y no lee la query", () => {
    const source = readFileSync(path.join(ROOT, "app/api/market/movers/route.ts"), "utf8");
    expect(source).toContain('handle("short"');
    expect(source).toContain("todayBoardSchema");
    expect(source).not.toContain("searchParams");
    expect(source).toContain("readHistory");
    expect(source).toContain("readUnderlyingCloses");
  });

  it("las tarjetas no agregan otro ancla de ficha", () => {
    const dir = path.join(ROOT, "components/domain/market-today");
    for (const name of ["market-today.tsx", "mover-card.tsx", "skeleton.tsx"]) {
      const source = readFileSync(path.join(dir, name), "utf8");
      expect(source).not.toContain("<a");
      expect(source).not.toContain("href=");
    }
    expect(readFileSync(path.join(dir, "mover-card.tsx"), "utf8")).toContain('role="link"');
  });
});
