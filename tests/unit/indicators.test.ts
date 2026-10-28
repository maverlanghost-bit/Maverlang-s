import { describe, expect, it } from "vitest";

import {
  percentFrom,
  positiveRows,
  rebase,
  rsi,
  sma,
  smaSeries,
  windowPoints,
} from "@/lib/market/indicators";

describe("sma", () => {
  it("promedia la ventana y deja null hasta completarla", () => {
    expect(sma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
    expect(sma([1, 2, 3], 1)).toEqual([1, 2, 3]);
    expect(sma([1, 2], 3)).toEqual([null, null]);
    expect(sma([], 2)).toEqual([]);
    expect(sma([1, 2], 0)).toEqual([null, null]);
    expect(sma([1, 2], 1.5)).toEqual([null, null]);
  });

  it("un precio que no es finito anula sólo las ventanas que lo tocan", () => {
    expect(sma([1, Number.NaN, 3, 4], 2)).toEqual([null, null, null, 3.5]);
  });
});

describe("rsi", () => {
  it("sigue el suavizado de Wilder en un período corto", () => {
    const values = rsi([10, 11, 12, 11, 13], 3);
    expect(values.slice(0, 3)).toEqual([null, null, null]);
    expect(values[3]).toBeCloseTo(200 / 3, 8);
    expect(values[4]).toBeCloseTo(500 / 6, 8);
  });

  it("sin pérdidas el índice queda en 100, y un hueco corta lo que sigue", () => {
    expect(rsi([10, 11, 12, 11, Number.NaN], 2)).toEqual([null, null, 100, 50, null]);
    const up = Array.from({ length: 15 }, (_, index) => index + 1);
    const long = rsi(up);
    expect(long[13]).toBeNull();
    expect(long[14]).toBe(100);
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
    expect(rsi([1, 2, 3, 4], 0)).toEqual([null, null, null, null]);
    expect(rsi([1, Number.NaN, 3, 4, 5], 2)).toEqual([null, null, null, null, null]);
  });
});

describe("rebase", () => {
  it("parte de cero, ordena y descarta precios que no son positivos", () => {
    expect(rebase([])).toEqual([]);
    expect(percentFrom(110, 100)).toBe(10);
    expect(percentFrom(100, 100)).toBe(0);
    expect(percentFrom(90, 100)).toBe(-10);
    expect(percentFrom(10, 0)).toBeNull();
    expect(
      rebase([
        { t: 2, p: 110 },
        { t: 1, p: 100 },
        { t: 1, p: 0 },
        { t: 3, p: 90 },
      ]),
    ).toEqual([
      { t: 1, p: 0 },
      { t: 2, p: 10 },
      { t: 3, p: -10 },
    ]);
    expect(rebase([{ t: 1, p: 150 }, { t: 2, p: 100 }], 100)).toEqual([
      { t: 1, p: 50 },
      { t: 2, p: 0 },
    ]);
    expect(rebase([{ t: 1, p: 10 }], 0)).toEqual([]);
  });

  it("positiveRows y windowPoints no inventan puntos", () => {
    expect(positiveRows([{ t: 2, p: -1 }, { t: 1, p: 4 }, { t: 1, p: 5 }])).toEqual([{ t: 1, p: 5 }]);
    expect(windowPoints([{ t: 1, p: 1 }, { t: 5, p: 2 }, { t: 3, p: 3 }], 2, 5)).toEqual([
      { t: 3, p: 3 },
      { t: 5, p: 2 },
    ]);
    expect(windowPoints([{ t: 1, p: 1 }], 5, 1)).toEqual([]);
  });
});

describe("smaSeries", () => {
  it("la ventana recorta, pero el promedio usa cierres anteriores", () => {
    const day = 86_400_000;
    const closes = Array.from({ length: 40 }, (_, index) => ({ t: index * day, p: 100 + index }));
    const series = smaSeries(closes, 20, { start: 30 * day, end: 39 * day });
    expect(series[0]).toEqual({ t: 30 * day, p: 120.5 });
    expect(series.some((point) => point.t < 30 * day)).toBe(false);
    expect(series.at(-1)?.t).toBe(39 * day);
    expect(smaSeries(closes, 50, { start: 30 * day, end: 39 * day })).toEqual([]);
  });
});
