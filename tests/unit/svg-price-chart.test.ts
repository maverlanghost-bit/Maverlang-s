import { describe, expect, it } from "vitest";

import {
  CHART_H,
  CHART_W,
  PAD_B,
  PAD_T,
  plotSeries,
  priceScale,
  smoothPath,
  toRows,
  xForTime,
  yForPrice,
} from "@/lib/market/chart-geometry";

describe("geometría del gráfico SVG", () => {
  it("smoothPath cubre vacío, un punto y la cúbica monótona", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 1.5, y: 2 }])).toBe("M 1.5 2");
    // Sube y se aplana: la tangente en el quiebre es 0, así que no se pasa de y=3.
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 6, y: 3 },
      ]),
    ).toBe("M 0.00 0.00 C 1.00 1.00, 2.00 3.00, 3.00 3.00 C 4.00 3.00, 5.00 3.00, 6.00 3.00");
  });

  it("la escala Y usa el mínimo y el máximo con 8% de margen", () => {
    expect(priceScale([])).toBeNull();
    expect(priceScale([Number.NaN])).toBeNull();

    const scale = priceScale([110, 100]);
    expect(scale).not.toBeNull();
    if (!scale) return;
    expect(scale.lo).toBeCloseTo(99.2, 8);
    expect(scale.hi).toBeCloseTo(110.8, 8);
    expect(yForPrice(scale.hi, scale)).toBeCloseTo(PAD_T, 8);
    expect(yForPrice(scale.lo, scale)).toBeCloseTo(CHART_H - PAD_B, 8);
    expect(yForPrice(110, scale)).toBeLessThan(yForPrice(100, scale));
  });

  it("una serie plana se abre para no dividir por cero", () => {
    const scale = priceScale([50, 50]);
    expect(scale).not.toBeNull();
    if (!scale) return;
    expect(scale.lo).toBeCloseTo(46, 8);
    expect(scale.hi).toBeCloseTo(54, 8);
    expect(yForPrice(50, scale)).toBeCloseTo(PAD_T + (CHART_H - PAD_T - PAD_B) / 2, 8);
  });

  it("el tiempo va de 0 al ancho del viewBox", () => {
    expect(xForTime(1_000, 1_000, 3_000)).toBe(0);
    expect(xForTime(3_000, 1_000, 3_000)).toBe(CHART_W);
    expect(xForTime(2_000, 1_000, 3_000)).toBe(CHART_W / 2);
    expect(xForTime(2_000, 5_000, 5_000)).toBe(0);
  });

  it("toRows limpia, ordena y sólo agrega el vivo si es posterior", () => {
    expect(
      toRows([
        { t: 30, p: 9 },
        { t: Number.NaN, p: 4 },
        { t: 10, p: 0 },
        { t: 10, p: 5 },
        { t: 20, p: 7 },
        { t: 20, p: 8 },
      ]),
    ).toEqual([
      { t: 10, p: 5 },
      { t: 20, p: 8 },
      { t: 30, p: 9 },
    ]);

    const rows = [
      { t: 10, p: 5 },
      { t: 20, p: 8 },
    ];
    expect(toRows(rows, { t: 25, p: 6 })).toEqual([...rows, { t: 25, p: 6 }]);
    expect(toRows(rows, { t: 20, p: 11 })).toEqual(rows);
    expect(toRows(rows, { t: 15, p: 11 })).toEqual(rows);
    expect(toRows(rows, { t: 25, p: 0 })).toEqual(rows);
    expect(toRows([], { t: 25, p: 6 })).toEqual([]);
  });

  it("con menos de dos puntos no hay trama, y el último precio queda a la derecha", () => {
    expect(plotSeries([{ t: 10, p: 5 }])).toBeNull();
    const plot = plotSeries([
      { t: 1_000, p: 100 },
      { t: 2_000, p: 110 },
      { t: 3_000, p: 100 },
    ]);
    expect(plot).not.toBeNull();
    if (!plot) return;
    expect(plot.points[0]?.x).toBe(0);
    expect(plot.points[2]?.x).toBe(CHART_W);
    expect(plot.points[1]?.y).toBeLessThan(plot.points[0]?.y ?? 0);
    expect(plot.points[1]?.x).toBe(CHART_W / 2);
  });
});
