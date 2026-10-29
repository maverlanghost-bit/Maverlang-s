import { describe, expect, it } from "vitest";

import { periodPerformance, portfolioPerformance } from "@/lib/portfolio/performance";

const aapl = {
  symbol: "AAPLx",
  shares: 2,
  avgCostUsd: 100,
  pnlUsd: 10,
  pnlPct: 0.05,
};

const nvda = {
  symbol: "NVDAx",
  shares: 1,
  avgCostUsd: 50,
  pnlUsd: -5,
  pnlPct: -0.1,
};

describe("rendimiento desde el costo promedio", () => {
  it("suma lo invertido y respeta el pnl del contrato", () => {
    const result = portfolioPerformance([aapl, nvda], { pnlUsd: 5, pnlPct: 0.02 });
    expect(result.investedUsd).toBe(250);
    expect(result.gainUsd).toBe(5);
    expect(result.gainPct).toBe(0.02);
    expect(result.best).toEqual({ symbol: "AAPLx", pnlPct: 0.05, pnlUsd: 10 });
    expect(result.worst).toEqual({ symbol: "NVDAx", pnlPct: -0.1, pnlUsd: -5 });
  });

  it("no presenta una suma parcial cuando falta el costo o el resultado", () => {
    const missingCost = portfolioPerformance(
      [aapl, { ...nvda, avgCostUsd: null, pnlUsd: null, pnlPct: null }],
      { pnlUsd: null, pnlPct: null },
    );
    expect(missingCost.investedUsd).toBeNull();
    expect(missingCost.gainUsd).toBeNull();
    expect(missingCost.gainPct).toBeNull();
    expect(missingCost.best).toBeNull();
    expect(missingCost.worst).toBeNull();
  });

  it("una cartera real sin costo medio no se rellena con ceros", () => {
    const live = portfolioPerformance(
      [{ symbol: "TSLAx", shares: 1, avgCostUsd: null, pnlUsd: null, pnlPct: null }],
      { pnlUsd: null, pnlPct: null },
    );
    expect(live).toEqual({
      investedUsd: null,
      gainUsd: null,
      gainPct: null,
      best: null,
      worst: null,
    });
  });

  it("sin posiciones el invertido es cero y el resultado ausente no pasa a cero", () => {
    const empty = portfolioPerformance([], { pnlUsd: null, pnlPct: null });
    expect(empty.investedUsd).toBe(0);
    expect(empty.gainUsd).toBeNull();
    expect(empty.gainPct).toBeNull();
    expect(empty.best).toBeNull();
  });

  it("conserva un resultado de cero que sí vino en el contrato", () => {
    const flat = portfolioPerformance([], { pnlUsd: 0, pnlPct: 0 });
    expect(flat.gainUsd).toBe(0);
    expect(flat.gainPct).toBe(0);
  });

  it("si el contrato no trae pnl, suma sólo cuando cada posición lo trae", () => {
    const summed = portfolioPerformance([aapl, nvda], { pnlUsd: null, pnlPct: null });
    expect(summed.gainUsd).toBe(5);
    expect(summed.gainPct).toBe(5 / 250);
    const partial = portfolioPerformance([aapl, { ...nvda, pnlUsd: null }], { pnlUsd: null, pnlPct: null });
    expect(partial.gainUsd).toBeNull();
    expect(partial.investedUsd).toBe(250);
  });

  it("desempata por monto y, si falta, por símbolo", () => {
    const byMoney = portfolioPerformance(
      [
        { symbol: "BBB", shares: 1, avgCostUsd: 10, pnlUsd: 1, pnlPct: 0.1 },
        { symbol: "AAA", shares: 1, avgCostUsd: 10, pnlUsd: 5, pnlPct: 0.1 },
      ],
      { pnlUsd: 6, pnlPct: 0.1 },
    );
    expect(byMoney.best?.symbol).toBe("AAA");
    expect(byMoney.worst?.symbol).toBe("BBB");

    const bySymbol = portfolioPerformance(
      [
        { symbol: "BBB", shares: 1, avgCostUsd: 10, pnlUsd: 1, pnlPct: 0.1 },
        { symbol: "AAA", shares: 1, avgCostUsd: 10, pnlUsd: 1, pnlPct: 0.1 },
      ],
      { pnlUsd: 2, pnlPct: 0.1 },
    );
    expect(bySymbol.worst?.symbol).toBe("AAA");
    expect(bySymbol.best?.symbol).toBe("BBB");
  });
});

describe("rendimiento del período del gráfico", () => {
  it("mide el primer punto contra el último", () => {
    expect(periodPerformance([{ p: 100 }, { p: 80 }, { p: 110 }])).toEqual({ deltaUsd: 10, pct: 0.1 });
  });

  it("no inventa una variación si la serie no alcanza", () => {
    expect(periodPerformance([])).toBeNull();
    expect(periodPerformance([{ p: 100 }])).toBeNull();
    expect(periodPerformance([{ p: 0 }, { p: 10 }])).toBeNull();
  });
});
