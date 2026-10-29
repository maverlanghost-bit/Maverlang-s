import type { PricePoint, Range } from "@/lib/types";

const DAY_MS = 86_400_000;
/** Serie real: misma ventana que el `s-maxage` del historial. */
export const HISTORY_FRESH_MS = 60_000;
/** Vacío o referencia: no se guarda el tiempo de una serie real. */
export const HISTORY_EMPTY_FRESH_MS = 15_000;

/**
 * 1D muestra las últimas `dayWindow` jornadas. El resto de rangos usa los
 * ticks tal cual (la consulta ya vino recortada).
 */
export function ticksForRange(
  range: Range,
  ticks: readonly PricePoint[],
  dayWindow: number,
  now: number,
): PricePoint[] {
  if (range !== "1D") return [...ticks];
  const from = now - dayWindow * DAY_MS;
  return ticks.filter((point) => point.t >= from);
}

/** null si no alcanzan para pintar. No reescala al último canje. */
export function ticksIfEnough(points: readonly PricePoint[], minTicks: number): PricePoint[] | null {
  if (points.length < minTicks) return null;
  return [...points];
}

/** Cierres del subyacente × multiplicador del token. Un factor inválido queda en 1. */
export function scaleCloses(closes: readonly PricePoint[], multiplier: number): PricePoint[] {
  const factor = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const out: PricePoint[] = [];
  for (const point of closes) {
    const price = point.p * factor;
    if (!Number.isFinite(point.t) || !Number.isFinite(price) || price <= 0) continue;
    out.push({ t: point.t, p: price });
  }
  return out;
}

/** Cuánto se puede reutilizar una serie ya armada. Un vacío no queda un minuto. */
export function historyMemoTtl(value: { points: readonly unknown[]; source: string }): number {
  return value.points.length >= 2 && value.source !== "mock" ? HISTORY_FRESH_MS : HISTORY_EMPTY_FRESH_MS;
}
