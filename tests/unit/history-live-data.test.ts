import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { historyQuerySchema, rangeSchema } from "@/lib/api/contracts";
import { priceHistory } from "@/lib/mocks/prices";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

describe("historial real", () => {
  const index = read("lib/services/index.ts");
  const closes = read("lib/services/underlying-prices.supabase.ts");
  const route = read("app/api/tickers/[symbol]/history/route.ts");
  const cron = read("app/api/cron/price-backfill/route.ts");

  it("1D entra al contrato y el mock de referencia compila", () => {
    expect(rangeSchema.parse("1D")).toBe("1D");
    expect(historyQuerySchema.parse({ range: "1D" }).range).toBe("1D");
    // Serie de referencia del mock. No es una cotización.
    const series = priceHistory("AAPLx", "1D", 1_700_000_000_000);
    expect(series).toHaveLength(48);
    expect(series.every((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0)).toBe(true);
  });

  it("en live no rellena con el mock ni reescala al spot", () => {
    expect(index).not.toContain("anchorSeriesToSpot");
    expect(index).toContain('return { points: [], source: "mock" }');
    expect(index.match(/mockPrices\.history\(/g)).toHaveLength(1);
    expect(index).toContain('new Set(["1D", "1W", "1M"])');
    expect(index).toContain("const DIAS = 2");
    expect(index).toContain("const MIN_TICKS = 2");
  });

  it("ALL pide 3650 días y pagina de a 1000", () => {
    expect(closes).toContain("ALL: 3650");
    expect(closes).toContain("const PAGE = 1000");
    expect(closes).toContain(".range(offset, offset + PAGE - 1)");
    expect(closes).toContain('tags: [PRICES_TAG]');
    expect(closes).toContain('export const PRICES_TAG = "underlying-prices"');
  });

  it("la ruta valida source y real; un vacío no entra al caché largo", () => {
    expect(route).toContain("historyFields(");
    expect(route).toContain("historyCacheControl(");
    expect(route).toContain("historyResponseSchema");
    expect(closes).toContain("shouldCacheUnderlyingPoints");
    expect(closes).toContain("underlying-closes-v3");
    expect(closes).not.toContain("if (error || !data || data.length === 0) break");
    expect(cron).toContain("revalidateTag(PRICES_TAG, \"max\")");
  });
});
