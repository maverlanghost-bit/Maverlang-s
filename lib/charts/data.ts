import type { Currency, PricePoint, Quote } from "@/lib/types";

export interface FinancialPoint extends PricePoint {
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
}

export type HistoryKind = "ticks" | "closes" | "mock";

/** Canonical UTC seconds, in ascending order. Last observation in a second wins. */
export function chartPoints<T extends PricePoint>(input: readonly T[]): T[] {
  const bySecond = new Map<number, T>();
  const sorted = input
    .filter((point) => Number.isFinite(point.t) && point.t > 0 && Number.isFinite(point.p) && point.p > 0)
    .slice()
    .sort((a, b) => a.t - b.t);
  for (const point of sorted) {
    const t = Math.floor(point.t / 1000) * 1000;
    bySecond.set(t, { ...point, t });
  }
  return [...bySecond.values()];
}

/** A token quote cannot extend an underlying's close or a synthetic demo curve. */
export function compatibleSpot(
  source: string | undefined,
  quote: Pick<Quote, "source" | "reference" | "priceUsd" | "updatedAt"> | null | undefined,
): PricePoint | undefined {
  if (source !== "ticks" || quote?.source !== "jupiter" || quote.reference) return undefined;
  const t = Date.parse(quote.updatedAt);
  return Number.isFinite(t) && t > 0 && Number.isFinite(quote.priceUsd) && quote.priceUsd > 0
    ? { t, p: quote.priceUsd }
    : undefined;
}

/** Preserves historical prices; never rescales them to the current quote. */
export function observedSeries<T extends PricePoint>(points: readonly T[], spot?: PricePoint): Array<T | PricePoint> {
  const rows = chartPoints(points);
  const last = rows[rows.length - 1];
  if (!spot || !last || spot.t < last.t) return rows;
  return chartPoints([...rows, spot]);
}

export function sharedWindow(series: readonly (readonly PricePoint[])[]): { start: number; end: number } | null {
  if (series.length === 0 || series.some((rows) => rows.length < 2)) return null;
  const start = Math.max(...series.map((rows) => rows[0]!.t));
  const end = Math.min(...series.map((rows) => rows[rows.length - 1]!.t));
  return start < end ? { start, end } : null;
}

export function inChartWindow<T extends PricePoint>(points: readonly T[], bounds: { start: number; end: number }): T[] {
  return points.filter((point) => point.t >= bounds.start && point.t <= bounds.end);
}

export function pricePrecision(value: number, currency: Currency = "USD"): number {
  const abs = Math.abs(value);
  if (currency === "CLP" && abs >= 10) return 0;
  if (abs >= 1 || abs === 0) return 2;
  return Math.min(12, Math.max(4, Math.ceil(-Math.log10(abs)) + 2));
}

export function historyDescription(source: string | undefined, en: boolean): string {
  if (source === "ticks") return en ? "Token price history" : "Historial del precio del token";
  if (source === "closes") return en ? "Underlying closes · reference" : "Cierres del subyacente · referencia";
  if (source === "mock") return en ? "Demonstration history" : "Historial de demostración";
  return en ? "History unavailable" : "Historial no disponible";
}
