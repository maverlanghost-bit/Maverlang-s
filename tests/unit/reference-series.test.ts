import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { historyQuerySchema, historyResponseSchema, rangeSchema } from "@/lib/api/contracts";
import { en } from "@/content/i18n/en";
import { esCL } from "@/content/i18n/es-CL";
import { priceHistory } from "@/lib/mocks/prices";
import { DETAIL_RANGES, isReferenceHistory } from "@/lib/market/series";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const TWO_POINTS = [
  { t: 1, p: 1 },
  { t: 2, p: 2 },
] as const;

describe("serie de referencia", () => {
  it("es referencia con source mock o con real distinto de true", () => {
    expect(isReferenceHistory({ source: "mock", real: false })).toBe(true);
    expect(isReferenceHistory({ source: "mock", real: true })).toBe(true);
    expect(isReferenceHistory({ source: "ticks", real: false })).toBe(true);
    expect(isReferenceHistory({ source: "closes", real: false })).toBe(true);
  });

  it("ticks o cierres marcados real no son referencia", () => {
    expect(isReferenceHistory({ source: "ticks", real: true })).toBe(false);
    expect(isReferenceHistory({ source: "closes", real: true })).toBe(false);
  });

  it("sin payload no rotula (carga o error)", () => {
    expect(isReferenceHistory(undefined)).toBe(false);
    expect(isReferenceHistory(null)).toBe(false);
  });

  it("la cartera es de referencia si alguna historia usada lo es", () => {
    const mixed = [
      { source: "closes", real: true },
      { source: "mock", real: false },
    ];
    const realOnly = [
      { source: "ticks", real: true },
      { source: "closes", real: true },
    ];
    expect(mixed.some((row) => isReferenceHistory(row))).toBe(true);
    expect(realOnly.some((row) => isReferenceHistory(row))).toBe(false);
  });
});

describe("rangos 1Y y 1D", () => {
  it("1Y está en el selector y en el contrato de historia", () => {
    expect(DETAIL_RANGES).toEqual(["1W", "1M", "3M", "1Y", "ALL"]);
    expect(rangeSchema.parse("1Y")).toBe("1Y");
    expect(historyQuerySchema.parse({ range: "1Y" }).range).toBe("1Y");
    expect(historyQuerySchema.parse({}).range).toBe("1M");
    // Ventana del mock: 365 pasos diarios. No es una cotización.
    expect(priceHistory("AAPLx", "1Y", 1_700_000_000_000)).toHaveLength(365);
  });

  it("1D está en Range y lo acepta la API", () => {
    expect(rangeSchema.parse("1D")).toBe("1D");
    expect(historyQuerySchema.parse({ range: "1D" }).range).toBe("1D");
    expect(read("lib/types/index.ts")).toContain('export type Range = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL"');
    expect(read("lib/api/contracts.ts")).toContain('z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"])');
    expect(read("lib/services/index.ts")).toContain('new Set(["1D", "1W", "1M"])');
    expect(read("lib/services/underlying-prices.supabase.ts")).toContain("ALL: 3650");
    expect(read("app/api/tickers/[symbol]/history/route.ts")).toContain('source !== "mock"');
  });

  it("el schema separa mock de ticks y de cierres", () => {
    const mock = historyResponseSchema.parse({ points: [...TWO_POINTS], real: false, source: "mock" });
    const closes = historyResponseSchema.parse({ points: [...TWO_POINTS], real: true, source: "closes" });
    expect(isReferenceHistory(mock)).toBe(true);
    expect(isReferenceHistory(closes)).toBe(false);
  });
});

describe("copy y pantallas", () => {
  it("la etiqueta visible dice que no es el precio real", () => {
    expect(esCL.detail.chartReference).toBe("Referencia: no es el precio real");
    expect(en.detail.chartReference).toBe("Reference only, not real prices");
  });

  it("el detalle rotula por el historial y pasa reference", () => {
    const pricePanel = read("app/(platform)/app/accion/[ticker]/price-panel.tsx");
    expect(pricePanel).toContain("isReferenceHistory(history.data)");
    expect(pricePanel).toContain("t.detail.chartReference");
    expect(pricePanel).toContain("reference={illustrative}");
    expect(pricePanel).toContain("DETAIL_RANGES");
    expect(pricePanel).not.toMatch(/const illustrative[\s\S]{0,240}jupiter/);
    expect(pricePanel).not.toContain("chartIllustrative");
  });

  it("la cartera rotula si alguna historia es de referencia y pasa reference", () => {
    const portfolio = read("app/(platform)/app/cartera/portfolio-screen.tsx");
    expect(portfolio).toContain("histories.some((query) => isReferenceHistory(query.data))");
    expect(portfolio).toContain("t.detail.chartReference");
    expect(portfolio).toContain("reference={reference}");
    expect(portfolio).toContain("DETAIL_RANGES");
  });
});
