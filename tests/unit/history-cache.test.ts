import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  HISTORY_CACHE_DATA,
  HISTORY_CACHE_MISS,
  HISTORY_EMPTY_STALE_MS,
  historyCacheControl,
  historyFields,
  historyResponseSchema,
  historyStaleMs,
  shouldCacheUnderlyingPoints,
} from "@/lib/api/contracts";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const TWO = [
  { t: 1_700_000_000_000, p: 100 },
  { t: 1_700_086_400_000, p: 110 },
];

describe("contrato de historia", () => {
  it("siempre trae source y real, también vacío o con fuente desconocida", () => {
    const empty = historyResponseSchema.parse(historyFields([], "closes"));
    expect(empty).toEqual({ points: [], real: false, source: "closes" });

    const failed = historyResponseSchema.parse(historyFields([], "upstream"));
    expect(failed).toEqual({ points: [], real: false, source: "mock" });

    const mock = historyResponseSchema.parse(historyFields(TWO, "mock"));
    expect(mock.source).toBe("mock");
    expect(mock.real).toBe(false);
    expect(mock.points).toHaveLength(2);

    const ticks = historyResponseSchema.parse(historyFields(TWO, "ticks"));
    expect(ticks).toMatchObject({ real: true, source: "ticks" });

    const one = historyResponseSchema.parse(historyFields([{ t: 1_700_000_000_000, p: 100 }], "closes"));
    expect(one.real).toBe(false);
    expect(one.source).toBe("closes");
  });
});

describe("caché de historia", () => {
  it("con datos usa s-maxage=60 y SWR; vacío, mock o error quedan en 30 s y sin CDN", () => {
    expect(historyCacheControl(historyFields(TWO, "closes"))).toBe(HISTORY_CACHE_DATA);
    expect(historyCacheControl(historyFields(TWO, "ticks"))).toBe(HISTORY_CACHE_DATA);
    expect(HISTORY_CACHE_DATA).toBe("public, s-maxage=60, stale-while-revalidate=300");

    expect(historyCacheControl(historyFields([], "closes"))).toBe(HISTORY_CACHE_MISS);
    expect(historyCacheControl(historyFields(TWO, "mock"))).toBe(HISTORY_CACHE_MISS);
    expect(historyCacheControl({ points: [], real: false, source: "ticks" })).toBe(HISTORY_CACHE_MISS);
    expect(HISTORY_CACHE_MISS).toBe("private, max-age=30");
    expect(HISTORY_CACHE_MISS).not.toContain("s-maxage");
  });

  it("un cierre vacío no se guarda y el cliente no lo trata como fresco", () => {
    expect(shouldCacheUnderlyingPoints(0)).toBe(false);
    expect(shouldCacheUnderlyingPoints(1)).toBe(false);
    expect(shouldCacheUnderlyingPoints(2)).toBe(true);
    expect(historyStaleMs(undefined, 300_000)).toBe(HISTORY_EMPTY_STALE_MS);
    expect(historyStaleMs({ points: [], real: false, source: "closes" }, 300_000)).toBe(HISTORY_EMPTY_STALE_MS);
    expect(historyStaleMs({ points: TWO, real: false, source: "closes" }, 300_000)).toBe(HISTORY_EMPTY_STALE_MS);
    expect(historyStaleMs({ points: TWO, real: true, source: "mock" }, 300_000)).toBe(HISTORY_EMPTY_STALE_MS);
    expect(historyStaleMs({ points: TWO, real: true, source: "closes" }, 300_000)).toBe(300_000);
    expect(HISTORY_EMPTY_STALE_MS).toBe(30_000);
  });

  it("la ruta, los cierres y los sparklines usan esa política", () => {
    const route = read("app/api/tickers/[symbol]/history/route.ts");
    const closes = read("lib/services/underlying-prices.supabase.ts");
    const hooks = read("lib/hooks/queries.ts");
    const market = read("app/(platform)/app/market-screen.tsx");

    expect(route).toContain("historyFields(");
    expect(route).toContain("historyCacheControl(fields)");
    expect(route).toContain("HISTORY_CACHE_MISS");
    expect(closes).toContain("shouldCacheUnderlyingPoints(points.length)");
    expect(closes).toContain("if (error) throw error");
    expect(closes).toContain('["underlying-closes-v3"]');
    expect(hooks).toContain("useMemo");
    expect(hooks).toContain("historyStaleMs");
    expect(market).toContain("searchQueryOptions");
    expect(market).toContain("priceQueries[index]?.data");
    expect(market).not.toContain("query.isPending");
  });
});
