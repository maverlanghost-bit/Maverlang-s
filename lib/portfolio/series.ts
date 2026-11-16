import { comparisonSeries } from "@/lib/charts/comparison";
import type { FinancialPoint } from "@/lib/charts/data";
import type { Activity, Position, PricePoint } from "@/lib/types";

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumUsd(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}

/** El total del servicio ya viene a centavos. Dos centavos alcanzan para el redondeo. */
export function sumsMatch(partsUsd: number, totalUsd: number): boolean {
  return Math.abs(partsUsd - totalUsd) < 0.02;
}

/**
 * Porcentajes a 0,1 % que suman 100. El residuo del redondeo queda en la tajada más grande.
 */
export function balancedPortions(values: readonly number[], total: number): number[] {
  if (values.length === 0 || !(total > 0)) return values.map(() => 0);
  const rounded = values.map((value) => Math.round((value / total) * 1000) / 1000);
  let used = 0;
  let largest = 0;
  for (let index = 0; index < rounded.length; index += 1) {
    const portion = rounded[index] ?? 0;
    used += portion;
    if (portion > (rounded[largest] ?? 0)) largest = index;
  }
  const drift = Math.round((1 - used) * 1000) / 1000;
  rounded[largest] = Math.round(((rounded[largest] ?? 0) + drift) * 1000) / 1000;
  return rounded;
}

/**
 * Hypothetical value of today's composition at historical prices. This is not
 * account equity or investment performance: holdings and cash stay constant.
 * Require coverage for every held asset; use dated known observations, never
 * future prices or a forced final point equal to today's account total.
 */
export function portfolioValueSeries(
  positions: readonly Pick<Position, "shares">[],
  histories: readonly (readonly PricePoint[])[],
  cashUsdc: number,
  _totalUsd: number,
  sources: readonly (string | undefined)[] = [],
): FinancialPoint[] {
  void _totalUsd; // Previous public signature; an account total is not a historical observation.
  if (!Number.isFinite(cashUsdc) || cashUsdc < 0 || histories.length !== positions.length) return [];
  if (positions.some((position) => !Number.isFinite(position.shares) || position.shares < 0)) return [];
  const held = positions.map((position, index) => ({ ...position, index })).filter((position) => position.shares > 0);
  if (!held.length || held.some((position) => (histories[position.index]?.length ?? 0) < 2)) return [];
  const aligned = comparisonSeries(held.map((position) => ({ id: String(position.index), points: histories[position.index]!, source: sources[position.index] })));
  if (aligned.unavailable.length || !aligned.bounds || aligned.series.some((series) => series.points.length < 2)) return [];
  const result = aligned.series[0]!.points.map((point, index) => {
    let value = cashUsdc;
    let gap = false;
    for (let slot = 0; slot < held.length; slot++) {
      const observation = aligned.series[slot]!.points[index]!;
      value += held[slot]!.shares * observation.p;
      gap ||= observation.gap === true;
    }
    return { t: point.t, p: cents(value), observedAt: point.t, ...(gap ? { gap: true } : {}) };
  });
  return result.every((point) => Number.isFinite(point.p)) ? result : [];
}

/** Clave estable para memorizar la serie sin depender de la identidad del arreglo. */
export function encodePoints(points: readonly FinancialPoint[]): string {
  let out = "";
  for (const point of points) {
    if (out.length > 0) out += "|";
    out += `${point.t},${point.p}${point.gap || point.observedAt !== undefined ? `,${point.gap ? 1 : 0},${point.observedAt ?? point.t}` : ""}`;
  }
  return out;
}

export function decodePoints(encoded: string): FinancialPoint[] {
  if (encoded.length === 0) return [];
  const points: FinancialPoint[] = [];
  for (const part of encoded.split("|")) {
    const comma = part.indexOf(",");
    if (comma < 0) continue;
    const t = Number(part.slice(0, comma));
    const [price, gap, date] = part.slice(comma + 1).split(",");
    const p = Number(price);
    const observedAt = date === undefined ? undefined : Number(date);
    if (Number.isFinite(t) && Number.isFinite(p)) points.push({ t, p, ...(gap === "1" ? { gap: true } : {}), ...(observedAt !== undefined && Number.isFinite(observedAt) ? { observedAt } : {}) });
  }
  return points;
}

/** Órdenes de compra y venta, de la más nueva a la más vieja. */
export function tradeActivity(rows: readonly Activity[]): Activity[] {
  const trades: Activity[] = [];
  for (const row of rows) {
    if (row.kind === "buy" || row.kind === "sell") trades.push(row);
  }
  return trades.sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));
}
