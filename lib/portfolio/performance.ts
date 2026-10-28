import { rangeMove } from "@/lib/market/series";
import type { Position } from "@/lib/types";

/**
 * Resultado desde el costo promedio y variación del gráfico.
 * Si falta un costo o un resultado, la cifra queda en null: no se rellena con cero.
 */

export interface RankedPosition {
  symbol: string;
  pnlPct: number;
  pnlUsd: number | null;
}

export interface PortfolioPerformance {
  /** Acciones × costo promedio. 0 si no hay posiciones. null si a alguna le falta el costo. */
  investedUsd: number | null;
  /** Diferencia contra el costo. null si ni la cartera ni cada posición lo traen. */
  gainUsd: number | null;
  /** Ratio (0,012 = 1,2 %). null si no se puede cerrar sin inventar el divisor. */
  gainPct: number | null;
  best: RankedPosition | null;
  worst: RankedPosition | null;
}

type CostPosition = Pick<Position, "symbol" | "shares" | "avgCostUsd" | "pnlUsd" | "pnlPct">;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareRank(left: CostPosition, right: CostPosition): number {
  const leftPct = left.pnlPct ?? 0;
  const rightPct = right.pnlPct ?? 0;
  if (leftPct !== rightPct) return leftPct - rightPct;
  if (finite(left.pnlUsd) && finite(right.pnlUsd) && left.pnlUsd !== right.pnlUsd) {
    return left.pnlUsd - right.pnlUsd;
  }
  if (left.symbol < right.symbol) return -1;
  if (left.symbol > right.symbol) return 1;
  return 0;
}

function toRank(position: CostPosition): RankedPosition | null {
  if (!finite(position.pnlPct)) return null;
  return {
    symbol: position.symbol,
    pnlPct: position.pnlPct,
    pnlUsd: finite(position.pnlUsd) ? position.pnlUsd : null,
  };
}

/**
 * `totals` es el pnl del contrato `/api/portfolio`. Si viene, manda:
 * no se reemplaza por una suma parcial de las filas.
 */
export function portfolioPerformance(
  positions: readonly CostPosition[],
  totals?: { pnlUsd?: number | null; pnlPct?: number | null },
): PortfolioPerformance {
  const open = positions.filter((position) => finite(position.shares) && position.shares > 0);
  const costsKnown = open.every((position) => {
    const cost = position.avgCostUsd;
    return finite(cost) && cost >= 0;
  });
  let investedUsd: number | null;
  if (open.length === 0) investedUsd = 0;
  else if (!costsKnown) investedUsd = null;
  else {
    let sum = 0;
    for (const position of open) sum += position.shares * (position.avgCostUsd ?? 0);
    investedUsd = cents(sum);
  }

  const reportedGain = totals?.pnlUsd;
  const reportedPct = totals?.pnlPct;
  const gainFromRows = open.every((position) => finite(position.pnlUsd));
  let gainUsd: number | null;
  if (finite(reportedGain)) gainUsd = reportedGain;
  else if (open.length === 0 || !gainFromRows) gainUsd = null;
  else {
    let sum = 0;
    for (const position of open) {
      if (finite(position.pnlUsd)) sum += position.pnlUsd;
    }
    gainUsd = cents(sum);
  }

  let gainPct: number | null;
  if (finite(reportedPct)) gainPct = reportedPct;
  else if (investedUsd !== null && investedUsd > 0 && gainUsd !== null) gainPct = gainUsd / investedUsd;
  else gainPct = null;

  const rankedKnown = open.every((position) => finite(position.pnlPct));
  let best: RankedPosition | null = null;
  let worst: RankedPosition | null = null;
  if (open.length > 0 && rankedKnown) {
    const ordered = [...open].sort(compareRank);
    const low = ordered[0];
    const high = ordered[ordered.length - 1];
    worst = low ? toRank(low) : null;
    best = high ? toRank(high) : null;
  }

  return { investedUsd, gainUsd, gainPct, best, worst };
}

/** Variación del primer al último punto del gráfico. null si la serie no alcanza. */
export function periodPerformance(points: readonly { p: number }[]): { deltaUsd: number; pct: number } | null {
  const pct = rangeMove(points);
  if (pct === null) return null;
  const first = points[0]?.p;
  const last = points[points.length - 1]?.p;
  if (!finite(first) || !finite(last)) return null;
  return { deltaUsd: last - first, pct };
}
