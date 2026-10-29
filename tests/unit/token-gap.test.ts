import { describe, expect, it } from "vitest";

import { gapPercentText, tokenStockGap } from "@/lib/portfolio/token-gap";

const closes = [
  { t: 1_700_000_000_000, p: 80 },
  { t: 1_700_086_400_000, p: 100 },
];

describe("brecha token contra el cierre real", () => {
  it("usa el último cierre y el lado del porcentaje", () => {
    const above = tokenStockGap({
      tokenUsd: 110,
      tokenAt: "2026-10-28T15:00:00.000Z",
      source: "closes",
      points: closes,
    });
    expect(above).toMatchObject({
      tokenUsd: 110,
      closeUsd: 100,
      diffPct: 0.1,
      side: "above",
      tokenAt: "2026-10-28T15:00:00.000Z",
      closeAt: new Date(1_700_086_400_000).toISOString(),
    });

    const below = tokenStockGap({ tokenUsd: 90, source: "closes", points: closes });
    expect(below?.side).toBe("below");
    expect(below?.diffPct).toBe(-0.1);

    const even = tokenStockGap({ tokenUsd: 100, source: "closes", points: closes });
    expect(even?.side).toBe("even");
  });

  it("acepta un solo cierre real", () => {
    const gap = tokenStockGap({
      tokenUsd: 105,
      source: "closes",
      points: [{ t: 1_700_086_400_000, p: 100 }],
    });
    expect(gap?.closeUsd).toBe(100);
    expect(gap?.side).toBe("above");
  });

  it("no muestra la brecha si la serie no es de cierres o falta un precio", () => {
    expect(tokenStockGap({ tokenUsd: 110, source: "ticks", points: closes })).toBeNull();
    expect(tokenStockGap({ tokenUsd: 110, source: "mock", points: closes })).toBeNull();
    expect(tokenStockGap({ tokenUsd: 110, source: "closes", points: [] })).toBeNull();
    expect(tokenStockGap({ tokenUsd: 110, source: "closes", points: null })).toBeNull();
    expect(tokenStockGap({ tokenUsd: null, source: "closes", points: closes })).toBeNull();
    expect(tokenStockGap({ tokenUsd: 0, source: "closes", points: closes })).toBeNull();
    expect(tokenStockGap({ tokenUsd: Number.NaN, source: "closes", points: closes })).toBeNull();
  });

  it("no retrocede a un cierre anterior si el último punto no sirve", () => {
    expect(
      tokenStockGap({
        tokenUsd: 110,
        source: "closes",
        points: [
          { t: 1, p: 50 },
          { t: 2, p: 0 },
        ],
      }),
    ).toBeNull();
    expect(
      tokenStockGap({
        tokenUsd: 110,
        source: "closes",
        points: [
          { t: 1, p: 50 },
          { t: 2, p: Number.NaN },
        ],
      }),
    ).toBeNull();
  });

  it("omite la hora inválida y conserva los precios", () => {
    const gap = tokenStockGap({
      tokenUsd: 110,
      tokenAt: "no-es-fecha",
      source: "closes",
      points: [{ t: Number.NaN, p: 100 }],
    });
    expect(gap?.tokenUsd).toBe(110);
    expect(gap?.closeUsd).toBe(100);
    expect(gap?.tokenAt).toBeNull();
    expect(gap?.closeAt).toBeNull();
  });

  it("escribe el porcentaje sin signo", () => {
    const text = gapPercentText(0.1234);
    expect(text).toContain("%");
    expect(text.startsWith("+")).toBe(false);
    expect(text.startsWith("-")).toBe(false);
    expect(gapPercentText(Number.NaN)).toBe("");
  });
});
