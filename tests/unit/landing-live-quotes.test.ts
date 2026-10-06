import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getLandingQuotes,
  LANDING_SYMBOLS,
  landingNotice,
  resetLandingQuotesCache,
} from "@/lib/landing/live-quotes";
import { ILLUSTRATIVE_NOTICE, landingQuotes } from "@/lib/mocks/landing";
import type { Quote } from "@/lib/types";

const ROOT = path.resolve(__dirname, "..", "..");
const NOW = 1_700_000_000_000;
const NOW_ISO = new Date(NOW).toISOString();

function liveQuote(symbol: string, priceUsd: number, change24hPct: number, updatedAt = NOW_ISO): Quote {
  return { symbol, priceUsd, change24hPct, multiplier: 1, updatedAt, source: "jupiter" };
}

function sampleOf(symbol: string) {
  const found = landingQuotes.find((quote) => quote.symbol === symbol);
  if (!found) throw new Error(`sin muestra para ${symbol}`);
  return found;
}

beforeEach(() => {
  resetLandingQuotesCache();
});

describe("M42: getLandingQuotes en vivo", () => {
  it("mapea quotes reales en una llamada y marca live true", async () => {
    const list = vi.fn(async (symbols: string[]) =>
      symbols.map((symbol, index) => liveQuote(symbol, 100 + index, 0.01 + index / 1000)),
    );

    const result = await getLandingQuotes({ list, live: true, now: () => NOW });

    expect(list).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledWith([...LANDING_SYMBOLS]);
    expect(result.live).toBe(true);
    expect(result.quotes).toHaveLength(LANDING_SYMBOLS.length);
    expect(result.updatedAt).toBe(NOW_ISO);
    for (const [index, quote] of result.quotes.entries()) {
      expect(quote.symbol).toBe(LANDING_SYMBOLS[index]);
      expect(quote.priceUsd).toBe(100 + index);
      expect(quote.change).toBeCloseTo(0.01 + index / 1000, 10);
      expect(quote.live).toBe(true);
      expect(quote.sparkline).toBeUndefined();
    }
  });

  it("si la fuente falla, devuelve la muestra con live false", async () => {
    const list = vi.fn(async (): Promise<Quote[]> => {
      throw new Error("red caída");
    });

    const result = await getLandingQuotes({ list, live: true, now: () => NOW });

    expect(result.live).toBe(false);
    expect(result.quotes).toHaveLength(landingQuotes.length);
    for (const quote of result.quotes) {
      const sample = sampleOf(quote.symbol);
      expect(quote.priceUsd).toBe(sample.priceUsd);
      expect(quote.change).toBe(sample.change);
      expect(quote.live).toBe(false);
      expect(quote.sparkline).toBeUndefined();
    }
  });

  it("si expira el tiempo, devuelve la muestra con live false", async () => {
    const list = vi.fn(
      () => new Promise<Quote[]>(() => undefined),
    );

    const result = await getLandingQuotes({ list, live: true, now: () => NOW, timeoutMs: 20 });

    expect(result.live).toBe(false);
    expect(result.quotes[0]?.priceUsd).toBe(landingQuotes[0]?.priceUsd);
  });

  it("sin modo live no llama a la fuente y devuelve la muestra", async () => {
    const list = vi.fn(async (symbols: string[]) => symbols.map((symbol) => liveQuote(symbol, 1, 0)));

    const result = await getLandingQuotes({ list, live: false, now: () => NOW });

    expect(list).not.toHaveBeenCalled();
    expect(result.live).toBe(false);
    expect(result.quotes.map((quote) => quote.priceUsd)).toEqual(
      landingQuotes.map((quote) => quote.priceUsd),
    );
  });

  it("si un símbolo llega como referencia, ese usa la muestra y live global es false", async () => {
    const [first, ...rest] = LANDING_SYMBOLS;
    if (!first) throw new Error("sin símbolos de portada");
    const list = vi.fn(async (symbols: string[]) =>
      symbols.map((symbol) =>
        symbol === first
          ? { ...liveQuote(symbol, 0, 0), source: "mock" as const, reference: true }
          : liveQuote(symbol, 321.5, 0.02),
      ),
    );

    const result = await getLandingQuotes({ list, live: true, now: () => NOW });

    expect(result.live).toBe(false);
    const failed = result.quotes.find((quote) => quote.symbol === first);
    expect(failed?.priceUsd).toBe(sampleOf(first).priceUsd);
    expect(failed?.live).toBe(false);
    const ok = result.quotes.find((quote) => quote.symbol === rest[0]);
    expect(ok?.priceUsd).toBe(321.5);
    expect(ok?.live).toBe(true);
  });

  it("la cache en memoria devuelve el mismo objeto en la segunda llamada", async () => {
    const first = await getLandingQuotes();
    const second = await getLandingQuotes();
    expect(second).toBe(first);
  });
});

describe("M42: etiqueta de la portada", () => {
  it("en vivo quita 'Precios ilustrativos' y avisa dólares en vivo", () => {
    expect(landingNotice(true)).toBe("Precios en dólares (US$), en vivo");
    expect(landingNotice(false)).toBe(ILLUSTRATIVE_NOTICE);
    expect(landingNotice(false)).toBe("Precios ilustrativos");
  });

  it("la portada no importa illustrativeSeries ni usa sparklines", () => {
    const files = [
      "app/(marketing)/page.tsx",
      "components/landing/hero.tsx",
      "components/landing/ticker-marquee.tsx",
      "components/landing/how-it-works.tsx",
      "components/landing/product-mock.tsx",
      "components/landing/live-landing-prices.tsx",
      "components/landing/landing-quote-preview.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      expect(source, `${file} importa illustrativeSeries`).not.toContain("illustrativeSeries");
      expect(source, `${file} usa sparkline`).not.toContain("sparkline");
      expect(source, `${file} usa Sparkline`).not.toContain("Sparkline");
    }
    for (const file of [
      "components/landing/hero.tsx",
      "components/landing/ticker-marquee.tsx",
      "components/landing/how-it-works.tsx",
      "components/landing/product-mock.tsx",
    ]) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      expect(source, `${file} etiqueta según live`).toContain("landingNotice(");
    }
  });
});
