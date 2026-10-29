import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { historyPollMs, priceQueryKey } from "@/lib/hooks/queries";
import {
  HISTORY_EMPTY_FRESH_MS,
  HISTORY_FRESH_MS,
  historyMemoTtl,
  scaleCloses,
  ticksForRange,
  ticksIfEnough,
} from "@/lib/services/history-series";
import type { PricePoint } from "@/lib/types";

const ROOT = path.resolve(__dirname, "..", "..");
const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function point(daysAgo: number, price: number): PricePoint {
  return { t: NOW - daysAgo * DAY_MS, p: price };
}

const REAL = {
  points: [point(2, 10), point(1, 11)],
  real: true,
  source: "ticks",
};

describe("serie de la ficha", () => {
  it("1D recorta a las últimas jornadas y el resto pasa tal cual", () => {
    const ticks = [point(3, 9), point(1, 10), point(0, 11)];
    expect(ticksForRange("1D", ticks, 2, NOW)).toEqual([point(1, 10), point(0, 11)]);
    expect(ticksForRange("1W", ticks, 2, NOW)).toEqual(ticks);
    expect(ticksForRange("1W", ticks, 2, NOW)).not.toBe(ticks);
  });

  it("no pinta con menos del mínimo y devuelve una copia", () => {
    const short = [point(0, 10)];
    expect(ticksIfEnough(short, 2)).toBeNull();
    const source = [point(1, 10), point(0, 11)];
    const enough = ticksIfEnough(source, 2);
    expect(enough).toEqual(source);
    expect(enough).not.toBe(source);
  });

  it("escala cierres y descarta un precio que no se puede pintar", () => {
    const closes = [point(1, 10), { t: Number.NaN, p: 10 }, point(0, 0), point(0, 12)];
    expect(scaleCloses(closes, 2)).toEqual([
      { t: point(1, 10).t, p: 20 },
      { t: point(0, 12).t, p: 24 },
    ]);
    expect(scaleCloses([point(0, 10)], Number.NaN)).toEqual([point(0, 10)]);
    expect(scaleCloses([point(0, 10)], 0)).toEqual([point(0, 10)]);
  });

  it("un vacío no se recuerda el mismo tiempo que una serie real", () => {
    expect(historyMemoTtl({ points: REAL.points, source: "ticks" })).toBe(HISTORY_FRESH_MS);
    expect(historyMemoTtl({ points: REAL.points, source: "mock" })).toBe(HISTORY_EMPTY_FRESH_MS);
    expect(historyMemoTtl({ points: [point(0, 10)], source: "closes" })).toBe(HISTORY_EMPTY_FRESH_MS);
    expect(HISTORY_FRESH_MS).toBe(60_000);
    expect(HISTORY_EMPTY_FRESH_MS).toBe(15_000);
  });
});

describe("sondeo del cliente", () => {
  it("una serie real no se vuelve a pedir; el vacío reintenta a lo más cada 30 s", () => {
    expect(historyPollMs(REAL)).toBe(false);
    expect(historyPollMs({ points: REAL.points, real: true, source: "closes" })).toBe(false);
    expect(historyPollMs(undefined)).toBe(30_000);
    expect(historyPollMs({ points: [], real: false, source: "mock" })).toBe(30_000);
    expect(historyPollMs({ points: REAL.points, real: false, source: "ticks" }, 10_000)).toBe(10_000);
  });

  it("la clave de precios ignora el orden, los vacíos y los repetidos", () => {
    expect(priceQueryKey(undefined)).toEqual([]);
    expect(priceQueryKey([" SPYx ", "AAPLx", "AAPLx", ""])).toEqual(["AAPLx", "SPYx"]);
  });
});

describe("la ficha no rearma la cascada", () => {
  const index = read("lib/services/index.ts");
  const prices = read("lib/services/prices.live.ts");
  const ticks = read("lib/services/price-ticks.supabase.ts");
  const closes = read("lib/services/underlying-prices.supabase.ts");
  const queries = read("lib/hooks/queries.ts");
  const company = read("app/api/tickers/[symbol]/company/route.ts");

  it("el historial real no pide Jupiter y el precio en vivo no reintenta", () => {
    const start = index.indexOf("async function realHistory(");
    const end = index.indexOf("async function loadHistory(");
    const body = index.slice(start, end);
    expect(index).toContain("livePrices.multiplierFor(");
    expect(body).toContain("closesFor(");
    expect(body).not.toContain("livePrices.list(");
    expect(index.match(/livePrices\.list\(/g)).toHaveLength(1);
    expect(prices).toContain("backoffMs: []");
    expect(prices).toContain("timeoutMs: 2_500");
    expect(prices).toContain("return mockMarketStatus()");
    expect(prices).not.toContain("NOT_IMPLEMENTED");
  });

  it("ticks y cierres tienen tope y abort", () => {
    expect(ticks).toContain("const HISTORY_CAP = 1_500");
    expect(ticks).toContain(".abortSignal(controller.signal)");
    expect(ticks).toContain('.order("t", { ascending: false })');
    expect(closes).toContain("const CLOSE_BUDGET_MS = 2_500");
    expect(closes).toContain(".abortSignal(controller.signal)");
    expect(closes).toContain("if (error) throw error;");
    expect(closes).not.toContain("if (error || !data || data.length === 0) break");
  });

  it("las sparklines usan el mismo sondeo y la ficha de empresa corta a 2,5 s", () => {
    expect(queries).toContain("getHistories(");
    expect(queries).toContain("historyPollMs(weakestHistory(state.state.data))");
    expect(company).toContain("COMPANY_TIMEOUT_MS = 2_500");
    expect(company).toContain('new DomainError("UPSTREAM")');
    expect(company).toContain("s-maxage=3600");
  });
});
