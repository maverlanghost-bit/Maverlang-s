import { describe, expect, it } from "vitest";

import { graficoCopy, graficoExtra } from "@/content/i18n/extra-grafico";
import {
  BENCHMARK_COLOR,
  BENCHMARK_DASH,
  BENCHMARK_WIDTH,
  RSI_H,
  RSI_PAD_B,
  RSI_PAD_T,
  buildChartModel,
  nearestPoint,
  nearestPointWithin,
  plotRsiLine,
  plotSeries,
  yForRsi,
} from "@/lib/market/chart-geometry";
import { chartStudies, type StudyInput } from "@/lib/market/indicators";

const day = 86_400_000;

function closes(count: number, priceAt = (index: number) => 100 + index) {
  return Array.from({ length: count }, (_, index) => ({ t: index * day, p: priceAt(index) }));
}

describe("buildChartModel", () => {
  const rows = [
    { t: 1_000, p: 100 },
    { t: 2_000, p: 110 },
    { t: 3_000, p: 100 },
  ];

  it("sin capas coincide con la escala de precio", () => {
    const model = buildChartModel(rows, [], null);
    const plot = plotSeries(rows);
    expect(model).not.toBeNull();
    expect(plot).not.toBeNull();
    if (!model || !plot) return;
    expect(model.percentMode).toBe(false);
    expect(model.layers).toEqual([]);
    expect(model.points.map((point) => point.x)).toEqual(plot.points.map((point) => point.x));
    expect(model.points.map((point) => point.y)).toEqual(plot.points.map((point) => point.y));
    expect(model.points.map((point) => point.usd)).toEqual([100, 110, 100]);
    expect(buildChartModel([{ t: 1, p: 5 }], [], null)).toBeNull();
  });

  it("una media alta comparte la escala y baja el precio en el eje", () => {
    const alone = buildChartModel(
      [
        { t: 0, p: 100 },
        { t: 1_000, p: 110 },
      ],
      [],
      null,
    );
    const withHigh = buildChartModel(
      [
        { t: 0, p: 100 },
        { t: 1_000, p: 110 },
      ],
      [
        {
          id: "sma-20",
          label: "SMA 20",
          color: "#2b7fd9",
          points: [
            { t: 0, p: 100 },
            { t: 1_000, p: 200 },
          ],
        },
      ],
      null,
    );
    expect(alone).not.toBeNull();
    expect(withHigh).not.toBeNull();
    if (!alone || !withHigh) return;
    const high = withHigh.layers[0]?.points[1];
    const main = withHigh.points[1];
    expect(high?.p).toBe(200);
    expect(high && main ? high.y : 0).toBeLessThan(main?.y ?? 0);
    expect(withHigh.points[1]?.y).toBeGreaterThan(alone.points[1]?.y ?? 0);
  });

  it("el benchmark rebasa las dos series a cero y deja la media en el mismo porcentaje", () => {
    const model = buildChartModel(
      [
        { t: 0, p: 100 },
        { t: 10, p: 110 },
      ],
      [
        {
          id: "sma-20",
          label: "SMA 20",
          color: "#111111",
          points: [
            { t: 0, p: 100 },
            { t: 10, p: 150 },
          ],
        },
      ],
      {
        label: "S&P 500",
        points: [
          { t: 0, p: 50 },
          { t: 10, p: 40 },
        ],
      },
    );
    expect(model).not.toBeNull();
    if (!model) return;
    expect(model.percentMode).toBe(true);
    expect(model.points[0]?.p).toBe(0);
    expect(model.points[0]?.usd).toBe(100);
    expect(model.points[1]?.p).toBeCloseTo(10, 8);
    const spy = model.layers.find((layer) => layer.id === "benchmark");
    const sma = model.layers.find((layer) => layer.id === "sma-20");
    expect(spy?.color).toBe(BENCHMARK_COLOR);
    expect(spy?.dash).toBe(BENCHMARK_DASH);
    expect(spy?.width).toBe(BENCHMARK_WIDTH);
    expect(spy?.points[0]?.p).toBe(0);
    expect(spy?.points[1]?.p).toBeCloseTo(-20, 8);
    expect(spy?.points[0]?.y).toBe(model.points[0]?.y);
    expect(sma?.points[1]?.p).toBeCloseTo(50, 8);
    expect(sma?.points[1]?.usd).toBe(150);
  });

  it("ignora un benchmark que cae fuera de la ventana", () => {
    const model = buildChartModel(rows, [], {
      label: "S&P 500",
      points: [
        { t: -5_000, p: 1 },
        { t: -4_000, p: 2 },
      ],
    });
    expect(model?.percentMode).toBe(false);
    expect(model?.layers).toEqual([]);
  });
});

describe("nearestPoint y RSI", () => {
  it("elige el tiempo más cercano", () => {
    const points = [
      { t: 0, usd: 1 },
      { t: 10, usd: 2 },
    ];
    expect(nearestPoint(points, 6)?.usd).toBe(2);
    expect(nearestPoint(points, 4)?.usd).toBe(1);
    expect(nearestPoint([], 1)).toBeNull();
    expect(nearestPoint(points, Number.NaN)).toBeNull();
    const daily = [
      { t: 0, usd: 1 },
      { t: 86_400_000, usd: 2 },
    ];
    expect(nearestPointWithin(daily, 10_000)?.usd).toBe(1);
    expect(nearestPointWithin(daily, -86_400_000 * 10)).toBeNull();
  });

  it("la escala del RSI es fija de 0 a 100", () => {
    expect(yForRsi(100)).toBe(RSI_PAD_T);
    expect(yForRsi(0)).toBe(RSI_H - RSI_PAD_B);
    expect(yForRsi(70)).toBeLessThan(yForRsi(30));
    expect(yForRsi(150)).toBe(yForRsi(100));
    expect(yForRsi(-10)).toBe(yForRsi(0));
    expect(yForRsi(Number.NaN)).toBe(yForRsi(0));
    expect(plotRsiLine([{ t: 0, p: 50 }], 0, 10)).toBeNull();
    expect(plotRsiLine([{ t: 0, p: 40 }, { t: 10, p: 60 }], 5, 5)).toBeNull();
    const line = plotRsiLine(
      [
        { t: 0, p: 40 },
        { t: 10, p: 60 },
      ],
      0,
      10,
    );
    expect(line?.points[0]?.y).toBeCloseTo(yForRsi(40), 8);
    expect(line?.points[1]?.x).toBeGreaterThan(line?.points[0]?.x ?? 0);
  });
});

describe("chartStudies", () => {
  const window = { start: 30 * day, end: 39 * day };
  const long = closes(40);

  function input(patch: Partial<StudyInput> = {}): StudyInput {
    return {
      symbol: "AAPLx",
      range: "1M",
      illustrative: false,
      window,
      spy: { points: closes(40, (index) => 200 + index), reference: false },
      closes: { points: long, reference: false },
      ...patch,
    };
  }

  it("arma SPY, la media con lookback y el RSI dentro de la ventana", () => {
    const studies = chartStudies(input());
    expect(studies.spyPoints.length).toBeGreaterThanOrEqual(2);
    expect(studies.spyPoints[0]?.t).toBe(30 * day);
    expect(studies.sma[20][0]).toEqual({ t: 30 * day, p: 120.5 });
    expect(studies.sma[20].some((point) => point.t < window.start)).toBe(false);
    expect(studies.sma[50]).toEqual([]);
    expect(studies.sma[200]).toEqual([]);
    expect(studies.rsi.length).toBeGreaterThanOrEqual(2);
  });

  it("en 1D no hay medias y SPYx no se compara consigo mismo", () => {
    const onDay = chartStudies(input({ range: "1D" }));
    expect(onDay.sma).toEqual({ 20: [], 50: [], 200: [] });
    expect(onDay.rsi.length).toBeGreaterThanOrEqual(2);
    expect(chartStudies(input({ symbol: "SPYx" })).spyPoints).toEqual([]);
    expect(chartStudies(input({ symbol: " spyx " })).spyPoints).toEqual([]);
  });

  it("no mezcla serie real con referencia y no inventa si falta la ventana", () => {
    const mixed = chartStudies(
      input({
        spy: { points: long, reference: true },
        closes: { points: long, reference: true },
      }),
    );
    expect(mixed.spyPoints).toEqual([]);
    expect(mixed.sma[20]).toEqual([]);
    expect(mixed.rsi).toEqual([]);

    const bothRef = chartStudies(input({ illustrative: true, spy: { points: long, reference: true }, closes: { points: long, reference: true } }));
    expect(bothRef.spyPoints.length).toBeGreaterThanOrEqual(2);
    expect(bothRef.sma[20].length).toBeGreaterThanOrEqual(2);

    expect(chartStudies(input({ window: null })).spyPoints).toEqual([]);
    expect(chartStudies(input({ spy: { points: [{ t: 0, p: 1 }], reference: false } })).spyPoints).toEqual([]);
    expect(chartStudies(input({ closes: null, spy: null })).rsi).toEqual([]);
  });
});

describe("textos del gráfico", () => {
  it("es-CL y en tienen la misma forma y el aviso neutro", () => {
    expect(Object.keys(graficoExtra.esCL).sort()).toEqual(Object.keys(graficoExtra.en).sort());
    expect(graficoExtra.esCL.disclaimer).toBe("Solo informativo, no es una recomendación");
    expect(graficoCopy("es-CL").help).toBe("¿Qué es esto?");
    expect(graficoCopy("en").disclaimer).toBe(graficoExtra.en.disclaimer);
    expect(graficoCopy("en").vsSpy).toBe("vs S&P 500");
    for (const pack of [graficoExtra.esCL, graficoExtra.en]) {
      expect(pack.spyHelp).toContain(pack.disclaimer);
      expect(pack.smaHelp).toContain(pack.disclaimer);
      expect(pack.rsiHelp).toContain(pack.disclaimer);
      for (const value of Object.values(pack)) {
        expect(value).not.toMatch(/compra|vende|\bbuy\b|\bsell\b|analista|analyst|inteligencia artificial/i);
      }
    }
  });
});
