import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SvgPriceChart, type PriceChartProps } from "@/components/domain/svg-price-chart";
import {
  CHART_H,
  CHART_W,
  PAD_B,
  PAD_T,
  changeFromOpen,
  openingPriceY,
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

  it("la línea de inicio está en el Y del primer precio", () => {
    expect(openingPriceY([])).toBeNull();
    expect(openingPriceY([{ y: Number.NaN }])).toBeNull();
    const plot = plotSeries([
      { t: 1_000, p: 100 },
      { t: 2_000, p: 110 },
    ]);
    expect(plot).not.toBeNull();
    if (!plot) return;
    expect(openingPriceY(plot.points)).toBe(plot.points[0]?.y);
  });

  it("el % contra el inicio usa signo +, coma decimal y verde en cero", () => {
    expect(changeFromOpen(100, 101.23)).toEqual({ label: "+1,23%", up: true });
    expect(changeFromOpen(100, 98.77)).toEqual({ label: "-1,23%", up: false });
    expect(changeFromOpen(200, 200)).toEqual({ label: "+0,00%", up: true });
    expect(changeFromOpen(200, 199)).toEqual({ label: "-0,50%", up: false });
    expect(changeFromOpen(100, 1_123.45)).toEqual({ label: "+1.023,45%", up: true });
    expect(changeFromOpen(0, 10)).toBeNull();
    expect(changeFromOpen(100, Number.NaN)).toBeNull();
    expect(changeFromOpen(-5, 10)).toBeNull();
  });
});

const chartProps = {
  tone: "up",
  label: "Precio del período",
  emptyLabel: "Sin datos de precio",
  onHover: () => {},
} satisfies Omit<PriceChartProps, "points">;

function markupOf(props: PriceChartProps): string {
  return renderToStaticMarkup(createElement(SvgPriceChart, props));
}

function openingLine(markup: string): string {
  const tag = markup.match(/<line\b[^>]*stroke="#e5e5e5"[^>]*>|<line\b[^>]*stroke='#e5e5e5'[^>]*>/);
  return tag?.[0] ?? "";
}

describe("SvgPriceChart", () => {
  it("no pide errorLabel y el estado vacío es una caja con título y subtítulo", () => {
    const withoutError: PriceChartProps = { ...chartProps, points: [] };
    const keys: "errorLabel" extends keyof PriceChartProps ? never : true = true;
    expect(keys).toBe(true);
    expect(withoutError.emptyHint).toBeUndefined();

    const empty = markupOf({ ...chartProps, points: [], emptyHint: "Cuando haya dos precios, el gráfico aparece." });
    expect(empty).toContain("h-56");
    expect(empty).toContain("sm:h-64");
    expect(empty).not.toContain("lg:h-72");
    expect(empty).toContain("rounded-xl");
    expect(empty).toContain("bg-neutral-50");
    expect(empty).toContain("items-center");
    expect(empty).toContain("justify-center");
    expect(empty).toContain("Sin datos de precio");
    expect(empty).toContain("Cuando haya dos precios, el gráfico aparece.");

    const titleOnly = markupOf({ ...chartProps, points: [{ t: 1_000, p: 100 }] });
    expect(titleOnly).toContain("Sin datos de precio");
    expect(titleOnly).not.toContain("Cuando haya dos precios");

    const quiet = markupOf({ ...chartProps, points: [], quiet: true, emptyHint: "No debe verse" });
    expect(quiet).not.toContain("Sin datos de precio");
    expect(quiet).not.toContain("No debe verse");
    expect(quiet).not.toContain("bg-neutral-50");
  });

  it("dibuja la línea punteada del precio inicial debajo del área y de la curva", () => {
    const points = [
      { t: 1_000, p: 100 },
      { t: 2_000, p: 110 },
      { t: 3_000, p: 100 },
    ];
    const markup = markupOf({ ...chartProps, points });
    const plot = plotSeries(toRows(points));
    const y = plot?.points[0]?.y;
    const tag = openingLine(markup);
    expect(tag).not.toBe("");
    expect(tag).toContain('stroke-dasharray="3 4"');
    expect(tag).toContain('stroke-width="2"');
    expect(tag).toContain('vector-effect="non-scaling-stroke"');
    expect(tag).toContain('x1="0"');
    expect(tag).toContain(`x2="${CHART_W}"`);
    expect(Number(/y1="([^"]+)"/.exec(tag)?.[1])).toBeCloseTo(y ?? Number.NaN, 6);
    expect(Number(/y2="([^"]+)"/.exec(tag)?.[1])).toBeCloseTo(y ?? Number.NaN, 6);

    const openAt = markup.indexOf('stroke="#e5e5e5"');
    const areaAt = markup.indexOf('fill="url(#');
    const curveAt = markup.indexOf('stroke-width="2.25"');
    expect(openAt).toBeGreaterThan(-1);
    expect(areaAt).toBeGreaterThan(openAt);
    expect(curveAt).toBeGreaterThan(areaAt);
    expect(markup).toContain("sm:h-64");
    expect(markup).not.toContain("lg:h-72");
    expect(markup).not.toContain("bg-neutral-50");
  });

  it("la serie de referencia también marca el precio inicial, debajo de su curva", () => {
    const markup = markupOf({
      ...chartProps,
      reference: true,
      points: [
        { t: 1_000, p: 100 },
        { t: 2_000, p: 101 },
      ],
    });
    const openAt = markup.indexOf('stroke="#e5e5e5"');
    const curveAt = markup.indexOf('stroke-width="2.25"');
    expect(openAt).toBeGreaterThan(-1);
    expect(curveAt).toBeGreaterThan(openAt);
    expect(markup).not.toContain('fill="url(#');
    expect(openingLine(markup)).toContain('stroke-dasharray="3 4"');
  });
});
