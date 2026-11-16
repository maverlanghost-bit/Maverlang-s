import type { PricePoint, Range } from "@/lib/types";
import { chartPoints } from "@/lib/charts/data";

/**
 * El % bajo el titular y "Variación {rango}" salen de `rangeMove` sobre esta serie
 * (el rango elegido). "Variación 24 h" no sale de aquí: es `Quote.change24hPct`
 * (en vivo, Jupiter `priceChange24h`).
 *
 * `1D` abre el selector (hoy). `1Y` también: el schema de historia lo acepta
 * y el mock arma 365 cierres diarios. En live, 1W/1M pueden salir de ticks;
 * 1Y sale de cierres diarios (366 días).
 */
export const DETAIL_RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const satisfies readonly ("1D" | Range)[];

export function isDetailRange(value: string): value is Range {
  return (DETAIL_RANGES as readonly string[]).includes(value);
}

/**
 * Serie que no se puede pintar como precio real.
 * `source: "mock"` es la ancla inventada. `real !== true` cubre ese caso y
 * también una respuesta sin dos observaciones. Sin payload (carga o error)
 * no hay serie que rotular. No mira la fuente del precio actual.
 */
export function isReferenceHistory(
  history: { source?: string | null; real?: boolean | null } | null | undefined,
): boolean {
  if (history == null) return false;
  return history.source === "mock" || history.real !== true;
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
  if (move === null) return "flat";
  return move >= 0 ? "up" : "down";
}

/**
 * @deprecated Historical compatibility name. Preserve observations instead of
 * rescaling the entire past to today's spot. Only append compatible, dated
 * token quotes through `observedSeries` + `compatibleSpot`.
 */
export function anchorSeriesToSpot(points: readonly PricePoint[], _spotUsd: number): PricePoint[] {
  void _spotUsd; // Retained for callers of the previous API; it must not rewrite history.
  return chartPoints(points);
}

/** Historical observations, independent of a quote from another source/time. */
export function seriesForQuote(points: readonly PricePoint[], _spotUsd: number | null | undefined): PricePoint[] {
  void _spotUsd;
  return chartPoints(points);
}
