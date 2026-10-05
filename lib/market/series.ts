import type { PricePoint, Range } from "@/lib/types";

export const DETAIL_RANGES = ["1W", "1M", "3M", "1Y", "ALL"] as const satisfies readonly Range[];

export function isDetailRange(value: string): value is Range {
  return (DETAIL_RANGES as readonly string[]).includes(value);
}

/** Variación del primer al último punto, como ratio. null si no alcanza. */
export function rangeMove(points: readonly Pick<PricePoint, "p">[]): number | null {
  if (points.length < 2) return null;
  const first = points[0]?.p;
  const last = points[points.length - 1]?.p;
  if (first === undefined || last === undefined) return null;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return (last - first) / first;
}

/** Máximo y mínimo del historial ya cargado. null si no hay precios finitos. */
export function rangeBounds(points: readonly Pick<PricePoint, "p">[]): { high: number; low: number } | null {
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let count = 0;
  for (const point of points) {
    if (!Number.isFinite(point.p)) continue;
    count += 1;
    if (point.p > high) high = point.p;
    if (point.p < low) low = point.p;
  }
  if (count === 0) return null;
  return { high, low };
}

export type ChartTone = "up" | "down" | "flat";

export function toneOf(move: number | null): ChartTone {
  if (move === null || move === 0) return "flat";
  return move > 0 ? "up" : "down";
}
