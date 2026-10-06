import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { priceFlashDirection } from "@/lib/hooks/use-price-flash";
import {
  elapsedSeconds,
  formatFreshness,
  freshnessDelayed,
  parseUpdatedAt,
} from "@/lib/market/freshness";

const ROOT = path.resolve(__dirname, "..", "..");

describe("M41: formato de frescura", () => {
  it("segundos en español e inglés", () => {
    expect(formatFreshness(0, "es-CL")).toBe("Actualizado hace 0 s");
    expect(formatFreshness(5, "es-CL")).toBe("Actualizado hace 5 s");
    expect(formatFreshness(59, "es-CL")).toBe("Actualizado hace 59 s");
    expect(formatFreshness(5, "en")).toBe("Updated 5s ago");
  });

  it("desde 60 s muestra minutos enteros", () => {
    expect(formatFreshness(60, "es-CL")).toBe("Actualizado hace 1 min");
    expect(formatFreshness(125, "es-CL")).toBe("Actualizado hace 2 min");
    expect(formatFreshness(60, "en")).toBe("Updated 1 min ago");
    expect(formatFreshness(150, "en")).toBe("Updated 2 min ago");
  });

  it("elapsedSeconds nunca es negativo y parsea ISO y timestamp", () => {
    expect(elapsedSeconds(1_000, 5_000)).toBe(0);
    expect(elapsedSeconds(65_000, 0)).toBe(65);
    expect(parseUpdatedAt("2026-10-06T00:00:10.000Z")).toBe(Date.parse("2026-10-06T00:00:10.000Z"));
    expect(parseUpdatedAt(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseUpdatedAt(null)).toBeNull();
    expect(parseUpdatedAt("no-fecha")).toBeNull();
  });

  it("con retraso si viene stale o pasaron más de 60 s", () => {
    expect(freshnessDelayed(5, false)).toBe(false);
    expect(freshnessDelayed(60, false)).toBe(false);
    expect(freshnessDelayed(61, false)).toBe(true);
    expect(freshnessDelayed(5, true)).toBe(true);
  });
});

describe("M41: dirección del destello", () => {
  it("sube, baja o se queda quieto", () => {
    expect(priceFlashDirection(100, 101, "USD", "USD")).toBe("up");
    expect(priceFlashDirection(100, 99, "USD", "USD")).toBe("down");
    expect(priceFlashDirection(100, 100, "USD", "USD")).toBeNull();
  });

  it("no destella en el primer render ni con valores inválidos", () => {
    expect(priceFlashDirection(null, 100, null, "USD")).toBeNull();
    expect(priceFlashDirection(undefined, 100, undefined, "USD")).toBeNull();
    expect(priceFlashDirection(Number.NaN, 100, "USD", "USD")).toBeNull();
    expect(priceFlashDirection(100, Number.NaN, "USD", "USD")).toBeNull();
  });

  it("no destella al cambiar de moneda (el número salta por el tipo de cambio)", () => {
    expect(priceFlashDirection(100, 95_000, "USD", "CLP")).toBeNull();
    expect(priceFlashDirection(95_000, 100, "CLP", "USD")).toBeNull();
  });
});

describe("M41: opciones de polling", () => {
  const source = readFileSync(path.join(ROOT, "lib", "hooks", "queries.ts"), "utf8");

  function blockOf(name: string): string {
    const start = source.indexOf(`export function ${name}(`);
    expect(start, `existe ${name}`).toBeGreaterThanOrEqual(0);
    const end = source.indexOf("export function", start + 1);
    return source.slice(start, end === -1 ? undefined : end);
  }

  it("PRICE_MS exportado en 15 000", () => {
    expect(source).toContain("export const PRICE_MS = 15_000");
  });

  it("usePrices revalida cada 15 s y al volver a la pestaña", () => {
    const block = blockOf("usePrices");
    expect(block).toContain("refetchInterval: PRICE_MS");
    expect(block).toContain("refetchOnWindowFocus: true");
    expect(block).toContain("staleTime: PRICE_MS");
  });

  it("useHistory revalida cada 60 s visible y al volver a la pestaña", () => {
    expect(source).toContain("export const HISTORY_REFETCH_MS = 60_000");
    const block = blockOf("useHistory");
    expect(block).toContain("refetchInterval: HISTORY_REFETCH_MS");
    expect(block).toContain("refetchIntervalInBackground: false");
    expect(block).toContain("refetchOnWindowFocus: true");
  });
});
