import { chartPoints, sharedWindow, type FinancialPoint } from "./data";
import type { PricePoint } from "@/lib/types";

export interface ComparisonInput {
  id: string;
  points: readonly PricePoint[];
  source?: string;
}

export interface ComparisonResult {
  id: string;
  source?: string;
  points: FinancialPoint[];
  returnRatio: number | null;
  hasGaps: boolean;
}

function maximumAge(points: readonly PricePoint[], source?: string): number {
  if (source === "closes") return 4 * 86_400_000;
  const gaps = points.slice(1).map((point, index) => point.t - points[index]!.t).filter((gap) => gap > 0).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] ?? 60_000;
  return Math.max(60_000, median * 3);
}

/**
 * Analytic comparison view: values known at the same time, never nearest future
 * prices. Carried observations retain their original date. Long gaps become
 * whitespace, not interpolated market observations. Original history is untouched.
 */
export function comparisonSeries(input: readonly ComparisonInput[]) {
  const clean = input.map((series) => ({ ...series, points: chartPoints(series.points) }));
  const available = clean.filter((series) => series.points.length >= 2);
  const bounds = sharedWindow(available.map((series) => series.points));
  const gapMarkers = available.flatMap((entry) => {
    const age = maximumAge(entry.points, entry.source);
    return entry.points.slice(1).flatMap((point, index) => point.t - entry.points[index]!.t > age ? [entry.points[index]!.t + age + 1000] : []);
  });
  const grid = bounds ? [...new Set([
    bounds.start, bounds.end,
    ...gapMarkers.filter((time) => time > bounds.start && time < bounds.end),
    ...available.flatMap((series) => series.points.filter((point) => point.t >= bounds.start && point.t <= bounds.end).map((point) => point.t)),
  ])].sort((a, b) => a - b) : [];
  const series: ComparisonResult[] = clean.map((entry) => {
    if (!bounds || entry.points.length < 2) return { id: entry.id, source: entry.source, points: [], returnRatio: null, hasGaps: false };
    const maxAge = maximumAge(entry.points, entry.source);
    let index = 0;
    const points: FinancialPoint[] = [];
    for (const t of grid) {
      while (index + 1 < entry.points.length && entry.points[index + 1]!.t <= t) index += 1;
      const observation = entry.points[index];
      if (!observation || observation.t > t) continue;
      points.push({ t, p: observation.p, observedAt: observation.t, gap: t - observation.t > maxAge });
    }
    const first = points[0];
    const last = points[points.length - 1];
    const hasGaps = points.some((point) => point.gap);
    if (!first || first.gap) return { id: entry.id, source: entry.source, points: [], returnRatio: null, hasGaps };
    return {
      id: entry.id, source: entry.source, points,
      returnRatio: first && last && !first.gap && !last.gap ? last.p / first.p - 1 : null,
      hasGaps,
    };
  });
  return { bounds, series, unavailable: series.filter((entry) => entry.points.length < 2).map((entry) => entry.id) };
}
