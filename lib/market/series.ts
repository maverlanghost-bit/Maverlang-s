import type { PricePoint, Range } from "@/lib/types";

/**
 * El % bajo el titular y "Variación {rango}" salen de `rangeMove` sobre esta serie
 * (el rango elegido). "Variación 24 h" no sale de aquí: es `Quote.change24hPct`
 * (en vivo, Jupiter `priceChange24h`).
 */
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

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Multiplica la serie para que el último punto sea `spotUsd`.
 * El máximo queda en el spot o sobre él, y el mínimo en el spot o bajo él,
 * porque el último punto entra en el rango.
 */
export function anchorSeriesToSpot(points: readonly PricePoint[], spotUsd: number): PricePoint[] {
  if (points.length === 0 || !Number.isFinite(spotUsd) || spotUsd <= 0) {
    return points.map((point) => ({ t: point.t, p: point.p }));
  }
  const last = points[points.length - 1]?.p;
  if (last === undefined || !Number.isFinite(last) || last <= 0) {
    return points.map((point) => ({ t: point.t, p: point.p }));
  }
  const factor = spotUsd / last;
  return points.map((point, index) => {
    if (index === points.length - 1) return { t: point.t, p: spotUsd };
    const scaled = point.p * factor;
    const next = Number.isFinite(scaled) && scaled > 0 ? round4(scaled) : point.p;
    return { t: point.t, p: next };
  });
}

/** La serie que ve la pantalla: anclada al spot del mismo quote, si lo hay. */
export function seriesForQuote(points: readonly PricePoint[], spotUsd: number | null | undefined): PricePoint[] {
  if (spotUsd == null || !Number.isFinite(spotUsd) || spotUsd <= 0) {
    return points.map((point) => ({ t: point.t, p: point.p }));
  }
  return anchorSeriesToSpot(points, spotUsd);
}
