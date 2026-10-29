/**
 * Geometría del gráfico grande. Precios en USD (`p`) y tiempo en ms (`t`).
 * La curva es la de Reclu: cúbica monótona (tangente 0 al cambiar de signo,
 * promedio de secantes si no). El eje Y sigue en precio: la línea punteada
 * marca el primer precio del período y el % del tooltip sale de ese precio.
 * Con benchmark, el eje Y pasa a porcentaje desde el inicio de cada serie.
 */

import { percentFrom, positiveRows } from "@/lib/market/indicators";

export const CHART_W = 720;
export const CHART_H = 260;
export const PAD_T = 16;
export const PAD_B = 28;
/** Margen vertical sobre el mínimo y el máximo de la serie. */
export const PRICE_MARGIN = 0.08;

export interface ChartRow {
  t: number;
  p: number;
}

export interface PriceScale {
  lo: number;
  hi: number;
}

export interface PlottedPoint extends ChartRow {
  x: number;
  y: number;
}

function plottable(point: { t: number; p: number } | null | undefined): point is ChartRow {
  return point != null && Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0;
}

/**
 * Ordena, descarta precios que no son finitos o no son positivos y, si hay
 * dos marcas en el mismo ms, se queda con la última. `livePoint` se agrega
 * al final sólo cuando su `t` es posterior al último de la serie.
 */
export function toRows(
  points: readonly { t: number; p: number }[],
  livePoint?: { t: number; p: number } | null,
): ChartRow[] {
  const sorted: ChartRow[] = [];
  for (const point of points) {
    if (plottable(point)) sorted.push({ t: point.t, p: point.p });
  }
  sorted.sort((a, b) => a.t - b.t);

  const rows: ChartRow[] = [];
  for (const point of sorted) {
    const prev = rows[rows.length - 1];
    if (prev && prev.t === point.t) {
      prev.p = point.p;
      continue;
    }
    rows.push(point);
  }

  const last = rows[rows.length - 1];
  if (last && plottable(livePoint) && livePoint.t > last.t) {
    rows.push({ t: livePoint.t, p: livePoint.p });
  }
  return rows;
}

/** Mínimo y máximo con 8% de margen. Una serie plana se abre ±8% del precio. */
export function priceScale(prices: readonly number[]): PriceScale | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const price of prices) {
    if (!Number.isFinite(price)) continue;
    count += 1;
    if (price < lo) lo = price;
    if (price > hi) hi = price;
  }
  if (count === 0) return null;
  if (!(hi > lo)) {
    const bump = Math.max(Math.abs(hi) * PRICE_MARGIN, 1e-6);
    return { lo: hi - bump, hi: hi + bump };
  }
  const pad = (hi - lo) * PRICE_MARGIN;
  return { lo: lo - pad, hi: hi + pad };
}

export function xForTime(t: number, t0: number, t1: number): number {
  if (!(t1 > t0)) return 0;
  return ((t - t0) / (t1 - t0)) * CHART_W;
}

export function yForPrice(price: number, scale: PriceScale): number {
  const span = scale.hi - scale.lo;
  const inner = CHART_H - PAD_T - PAD_B;
  if (!(span > 0)) return PAD_T + inner / 2;
  return PAD_T + (1 - (price - scale.lo) / span) * inner;
}

/** Y de la línea punteada: el primer precio del período, en la misma escala. */
export function openingPriceY(points: readonly { y: number }[]): number | null {
  const first = points[0];
  if (!first || !Number.isFinite(first.y)) return null;
  return first.y;
}

/**
 * Variación contra el primer precio del período.
 * 100 → 101,23 da "+1,23%" en verde. El cero también lleva "+" y cuenta como alza.
 * null si la base no es un precio positivo.
 */
export function changeFromOpen(open: number, price: number): { label: string; up: boolean } | null {
  if (!(open > 0) || !Number.isFinite(price)) return null;
  const cents = Math.round(((price - open) / open) * 10_000);
  if (!Number.isFinite(cents)) return null;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return { label: `${negative ? "-" : "+"}${grouped},${frac}%`, up: !negative };
}

export function plotSeries(rows: readonly ChartRow[]): { points: PlottedPoint[]; scale: PriceScale } | null {
  if (rows.length < 2) return null;
  const scale = priceScale(rows.map((row) => row.p));
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!scale || !first || !last) return null;
  const points = rows.map((row) => ({
    t: row.t,
    p: row.p,
    x: xForTime(row.t, first.t, last.t),
    y: yForPrice(row.p, scale),
  }));
  return { points, scale };
}

/** Curva suave monótona (Fritsch-Carlson) → path SVG. */
export function smoothPath(pts: readonly { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const start = pts[0];
  if (!start) return "";
  if (n === 1) return `M ${start.x} ${start.y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const left = pts[i];
    const right = pts[i + 1];
    if (!left || !right) continue;
    const span = right.x - left.x || 1e-6;
    dx.push(span);
    slope.push((right.y - left.y) / (span || 1e-6));
  }
  if (dx.length !== n - 1) return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`;

  const tangent: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const prev = slope[i - 1] ?? 0;
    const next = slope[i] ?? 0;
    tangent.push(prev * next <= 0 ? 0 : (prev + next) / 2);
  }
  tangent.push(slope[n - 2] ?? 0);

  let d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const left = pts[i];
    const right = pts[i + 1];
    const span = dx[i];
    const arrive = tangent[i];
    const leave = tangent[i + 1];
    if (!left || !right || span === undefined || arrive === undefined || leave === undefined) continue;
    const h = span / 3;
    d += ` C ${(left.x + h).toFixed(2)} ${(left.y + arrive * h).toFixed(2)}, ${(right.x - h).toFixed(2)} ${(right.y - leave * h).toFixed(2)}, ${right.x.toFixed(2)} ${right.y.toFixed(2)}`;
  }
  return d;
}

/** S&P 500: gris, punteado 5 5, 1,5 px. El vector-effect del SVG lo deja en px de pantalla. */
export const BENCHMARK_COLOR = "#a3a3a3";
export const BENCHMARK_DASH = "5 5";
export const BENCHMARK_WIDTH = 1.5;
export const OVERLAY_WIDTH = 1.5;

/** Panel RSI: escala fija 0–100, sin el margen del precio. */
export const RSI_H = 72;
export const RSI_PAD_T = 8;
export const RSI_PAD_B = 16;

export interface ChartOverlay {
  id: string;
  points: readonly { t: number; p: number }[];
  color: string;
  dash?: string;
  label: string;
}

export interface ChartBenchmark {
  points: readonly { t: number; p: number }[];
  label: string;
}

export interface ChartLayerModel {
  id: string;
  label: string;
  color: string;
  width: number;
  dash?: string;
  line: string;
  points: Array<PlottedPoint & { usd: number }>;
}

export interface ChartModel {
  points: Array<PlottedPoint & { usd: number }>;
  line: string;
  scale: PriceScale;
  layers: ChartLayerModel[];
  /** true cuando el eje Y es % desde el inicio (hay benchmark con datos). */
  percentMode: boolean;
}

interface MappedPoint {
  t: number;
  p: number;
  usd: number;
}

/**
 * Arma la serie principal y las capas en una sola escala.
 * Sin benchmark, Y es precio e incluye las medias para que no se corten.
 * Con benchmark, Y es %: la serie y SPYx parten de su primer precio en la
 * ventana; las medias se miden contra el primer precio de la serie.
 */
export function buildChartModel(
  rows: readonly ChartRow[],
  overlays: readonly ChartOverlay[] = [],
  benchmark?: ChartBenchmark | null,
  /** Máximos y mínimos reales (velas). No rellena OHLC a partir del cierre. */
  extraPrices?: readonly number[],
): ChartModel | null {
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last || !(first.p > 0)) return null;
  const t0 = first.t;
  const t1 = last.t;
  const assetBase = first.p;

  const spyRows = benchmark
    ? positiveRows(benchmark.points).filter((row) => row.t >= t0 && row.t <= t1)
    : [];
  const percentMode = spyRows.length >= 2;
  const spyBase = spyRows[0]?.p;

  const preparedOverlays: { overlay: ChartOverlay; mapped: MappedPoint[] }[] = [];
  for (const overlay of overlays) {
    const source = positiveRows(overlay.points).filter((row) => row.t >= t0 && row.t <= t1);
    const mapped = mapRows(source, (price) => (percentMode ? percentFrom(price, assetBase) : price));
    if (mapped.length < 2) continue;
    preparedOverlays.push({ overlay, mapped });
  }

  const mainMapped = mapRows(rows, (price) => (percentMode ? percentFrom(price, assetBase) : price));
  if (mainMapped.length < 2) return null;

  const yValues: number[] = mainMapped.map((row) => row.p);
  if (percentMode && spyBase !== undefined) {
    for (const row of spyRows) {
      const plotted = percentFrom(row.p, spyBase);
      if (plotted !== null) yValues.push(plotted);
    }
  }
  for (const item of preparedOverlays) {
    for (const row of item.mapped) yValues.push(row.p);
  }
  if (extraPrices) {
    for (const price of extraPrices) {
      if (!Number.isFinite(price)) continue;
      const plotted = percentMode ? percentFrom(price, assetBase) : price;
      if (plotted !== null && Number.isFinite(plotted)) yValues.push(plotted);
    }
  }

  const scale = priceScale(yValues);
  if (!scale) return null;

  const place = (mapped: readonly MappedPoint[]): ChartLayerModel["points"] =>
    mapped.map((row) => ({
      t: row.t,
      p: row.p,
      usd: row.usd,
      x: xForTime(row.t, t0, t1),
      y: yForPrice(row.p, scale),
    }));

  const points = place(mainMapped);
  const layers: ChartLayerModel[] = preparedOverlays.map((item) => {
    const layerPoints = place(item.mapped);
    return {
      id: item.overlay.id,
      label: item.overlay.label,
      color: item.overlay.color,
      width: OVERLAY_WIDTH,
      dash: item.overlay.dash,
      line: smoothPath(layerPoints),
      points: layerPoints,
    };
  });

  if (percentMode && benchmark && spyBase !== undefined && spyBase > 0) {
    const mapped = mapRows(spyRows, (price) => percentFrom(price, spyBase));
    if (mapped.length >= 2) {
      const layerPoints = place(mapped);
      layers.push({
        id: "benchmark",
        label: benchmark.label,
        color: BENCHMARK_COLOR,
        width: BENCHMARK_WIDTH,
        dash: BENCHMARK_DASH,
        line: smoothPath(layerPoints),
        points: layerPoints,
      });
    }
  }

  return {
    points,
    line: smoothPath(points),
    scale,
    layers,
    percentMode,
  };
}

function mapRows(
  rows: readonly { t: number; p: number }[],
  plot: (price: number) => number | null,
): MappedPoint[] {
  const mapped: MappedPoint[] = [];
  for (const row of rows) {
    const plotted = plot(row.p);
    if (plotted === null || !Number.isFinite(plotted)) continue;
    mapped.push({ t: row.t, p: plotted, usd: row.p });
  }
  return mapped;
}

/** Punto de la serie cuyo tiempo está más cerca de `t`. */
export function nearestPoint<T extends { t: number }>(points: readonly T[], t: number): T | null {
  if (!Number.isFinite(t) || points.length === 0) return null;
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.t)) continue;
    const distance = Math.abs(point.t - t);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

/**
 * Como `nearestPoint`, pero null si el punto queda más lejos que 1,5 veces
 * el hueco con su vecino. Así un hover al inicio no muestra una media que
 * todavía no existe.
 */
export function nearestPointWithin<T extends { t: number }>(points: readonly T[], t: number): T | null {
  const point = nearestPoint(points, t);
  if (!point) return null;
  let index = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i] === point) {
      index = i;
      break;
    }
  }
  if (index < 0) return null;
  const gaps: number[] = [];
  const prev = index > 0 ? points[index - 1] : undefined;
  const next = points[index + 1];
  if (prev && prev.t < point.t) gaps.push(point.t - prev.t);
  if (next && next.t > point.t) gaps.push(next.t - point.t);
  let step = Number.POSITIVE_INFINITY;
  for (const gap of gaps) {
    if (gap > 0 && gap < step) step = gap;
  }
  if (!Number.isFinite(step)) return point;
  if (Math.abs(point.t - t) > step * 1.5) return null;
  return point;
}

/** Y del RSI en la escala fija 0–100. 100 arriba, 0 abajo. Fuera de rango se recorta. */
export function yForRsi(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  const clamped = Math.min(100, Math.max(0, safe));
  const inner = RSI_H - RSI_PAD_T - RSI_PAD_B;
  return RSI_PAD_T + (1 - clamped / 100) * inner;
}

/** Línea del RSI alineada al mismo intervalo de tiempo que el precio. */
export function plotRsiLine(
  points: readonly { t: number; p: number }[],
  t0: number,
  t1: number,
): { line: string; points: PlottedPoint[] } | null {
  if (!(t1 > t0)) return null;
  const rows = points.filter(
    (point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.t >= t0 && point.t <= t1,
  );
  if (rows.length < 2) return null;
  const placed: PlottedPoint[] = rows.map((row) => ({
    t: row.t,
    p: row.p,
    x: xForTime(row.t, t0, t1),
    y: yForRsi(row.p),
  }));
  return { line: smoothPath(placed), points: placed };
}

/**
 * El historial público trae sólo cierre (`t`, `p`). Estas lecturas no inventan
 * apertura, máximo, mínimo ni volumen a partir de ese cierre.
 */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowOf(point: object): Record<string, unknown> {
  return point as Record<string, unknown>;
}

export interface OhlcBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface VolumeBar {
  t: number;
  v: number;
}

function ohlcOf(row: Record<string, unknown>): OhlcBar | null {
  const t = finiteNumber(row.t);
  const o = finiteNumber(row.o);
  const h = finiteNumber(row.h);
  const l = finiteNumber(row.l);
  const c = finiteNumber(row.c);
  if (t === null || o === null || h === null || l === null || c === null) return null;
  if (!(o > 0 && h > 0 && l > 0 && c > 0)) return null;
  if (h < l || h < o || h < c || l > o || l > c) return null;
  return { t, o, h, l, c };
}

function pushUniqueTime<T extends { t: number }>(rows: T[], row: T) {
  const prev = rows[rows.length - 1];
  if (prev && prev.t === row.t) {
    rows[rows.length - 1] = row;
    return;
  }
  rows.push(row);
}

/** Velas sólo si el punto trae o, h, l y c. Hacen falta dos para dibujar. */
export function readOhlc(points: readonly object[]): OhlcBar[] {
  const found: OhlcBar[] = [];
  for (const point of points) {
    if (point == null || typeof point !== "object") continue;
    const bar = ohlcOf(rowOf(point));
    if (bar) found.push(bar);
  }
  found.sort((a, b) => a.t - b.t);
  const rows: OhlcBar[] = [];
  for (const bar of found) pushUniqueTime(rows, bar);
  return rows;
}

/** Volumen sólo si el punto trae `v` finito y no negativo. */
export function readVolume(points: readonly object[]): VolumeBar[] {
  const found: VolumeBar[] = [];
  for (const point of points) {
    if (point == null || typeof point !== "object") continue;
    const row = rowOf(point);
    const t = finiteNumber(row.t);
    const v = finiteNumber(row.v);
    if (t === null || v === null || v < 0) continue;
    found.push({ t, v });
  }
  found.sort((a, b) => a.t - b.t);
  const rows: VolumeBar[] = [];
  for (const bar of found) pushUniqueTime(rows, bar);
  return rows;
}

/** true sólo con datos reales de volumen u OHLC. Un cierre suelto no alcanza. */
export function barAvailability(points: readonly object[]): { volume: boolean; ohlc: boolean } {
  const volume = readVolume(points);
  let positive = false;
  for (const row of volume) {
    if (row.v > 0) {
      positive = true;
      break;
    }
  }
  return { volume: volume.length >= 2 && positive, ohlc: readOhlc(points).length >= 2 };
}

export interface CandleMark {
  t: number;
  x: number;
  yHigh: number;
  yLow: number;
  yOpen: number;
  yClose: number;
  up: boolean;
  width: number;
}

export function candleMarks(
  bars: readonly OhlcBar[],
  t0: number,
  t1: number,
  scale: PriceScale,
  percentMode: boolean,
  base: number,
): CandleMark[] | null {
  if (!(t1 > t0)) return null;
  const rows = bars.filter((bar) => bar.t >= t0 && bar.t <= t1);
  if (rows.length < 2) return null;
  let minGap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const next = rows[i];
    if (!prev || !next) continue;
    const gap = next.t - prev.t;
    if (gap > 0 && gap < minGap) minGap = gap;
  }
  const gapPx = Number.isFinite(minGap) ? xForTime(t0 + minGap, t0, t1) : 8;
  const width = Math.max(1.25, Math.min(12, gapPx * 0.62));
  const toPlot = (price: number) => (percentMode ? percentFrom(price, base) : price);
  const marks: CandleMark[] = [];
  for (const bar of rows) {
    const high = toPlot(bar.h);
    const low = toPlot(bar.l);
    const open = toPlot(bar.o);
    const close = toPlot(bar.c);
    if (high === null || low === null || open === null || close === null) continue;
    marks.push({
      t: bar.t,
      x: xForTime(bar.t, t0, t1),
      yHigh: yForPrice(high, scale),
      yLow: yForPrice(low, scale),
      yOpen: yForPrice(open, scale),
      yClose: yForPrice(close, scale),
      up: bar.c >= bar.o,
      width,
    });
  }
  return marks.length >= 2 ? marks : null;
}

export const VOLUME_H = 40;

export interface VolumeMark {
  t: number;
  x: number;
  y: number;
  height: number;
  width: number;
}

export function volumeMarks(rows: readonly VolumeBar[], t0: number, t1: number): VolumeMark[] | null {
  if (!(t1 > t0)) return null;
  const picked = rows.filter((row) => row.t >= t0 && row.t <= t1 && row.v >= 0);
  if (picked.length < 2) return null;
  let max = 0;
  for (const row of picked) {
    if (row.v > max) max = row.v;
  }
  if (!(max > 0)) return null;
  let minGap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < picked.length; i++) {
    const prev = picked[i - 1];
    const next = picked[i];
    if (!prev || !next) continue;
    const gap = next.t - prev.t;
    if (gap > 0 && gap < minGap) minGap = gap;
  }
  const gapPx = Number.isFinite(minGap) ? xForTime(t0 + minGap, t0, t1) : 8;
  const width = Math.max(1.25, Math.min(12, gapPx * 0.62));
  const inner = VOLUME_H - 8;
  return picked.map((row) => {
    const height = (row.v / max) * inner;
    return {
      t: row.t,
      x: xForTime(row.t, t0, t1),
      y: VOLUME_H - 4 - height,
      height,
      width,
    };
  });
}
