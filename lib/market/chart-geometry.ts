/**
 * Geometría del gráfico grande. Precios en USD (`p`) y tiempo en ms (`t`).
 * La curva es la de Reclu: cúbica monótona (tangente 0 al cambiar de signo,
 * promedio de secantes si no). No son porcentajes ni un benchmark.
 */

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
