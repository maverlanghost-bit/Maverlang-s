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
 * Precio de una serie en el instante `t` (el punto más cercano en el tiempo).
 * Las series reales de cada símbolo no comparten timestamps exactos, así que
 * alinear por índice daba saltos erráticos: se alinea por tiempo.
 */
function priceAt(series: readonly PricePoint[], t: number): number | null {
  if (series.length === 0) return null;
  let best = series[0];
  if (!best) return null;
  let bestGap = Math.abs(best.t - t);
  for (const point of series) {
    const gap = Math.abs(point.t - t);
    if (gap < bestGap) {
      best = point;
      bestGap = gap;
    }
    // La serie está ordenada por tiempo: una vez que pasamos de t, no seguir.
    if (point.t > t && gap > bestGap) break;
  }
  return best.p;
}

/**
 * Serie de valor de la cartera en el tiempo. Suma, en cada instante, el
 * efectivo más el valor de cada posición al precio real de ESE momento. El
 * timestamp de referencia lo da la serie con más puntos; el último punto se
 * fija en `totalUsd` (el total vivo del servicio) para que cierre exacto.
 */
export function portfolioValueSeries(
  positions: readonly Pick<Position, "shares">[],
  histories: readonly (readonly PricePoint[])[],
  cashUsdc: number,
  totalUsd: number,
): PricePoint[] {
  if (positions.length === 0 || histories.length !== positions.length) return [];
  // Rejilla temporal: unión ordenada de todos los timestamps (serie más larga
  // como base; el resto aporta sus puntos para no perder variaciones reales).
  const stamps = new Set<number>();
  for (const series of histories) {
    for (const point of series) stamps.add(point.t);
  }
  const grid = [...stamps].sort((a, b) => a - b);
  if (grid.length < 2) return [];

  const points: PricePoint[] = [];
  grid.forEach((t, index) => {
    let value = cashUsdc;
    for (let slot = 0; slot < positions.length; slot += 1) {
      const price = priceAt(histories[slot] ?? [], t);
      if (price !== null) value += (positions[slot]?.shares ?? 0) * price;
    }
    points.push({ t, p: index === grid.length - 1 ? totalUsd : cents(value) });
  });
  return points.length >= 2 ? points : [];
}

/** Clave estable para memorizar la serie sin depender de la identidad del arreglo. */
export function encodePoints(points: readonly PricePoint[]): string {
  let out = "";
  for (const point of points) {
    if (out.length > 0) out += "|";
    out += `${point.t},${point.p}`;
  }
  return out;
}

export function decodePoints(encoded: string): PricePoint[] {
  if (encoded.length === 0) return [];
  const points: PricePoint[] = [];
  for (const part of encoded.split("|")) {
    const comma = part.indexOf(",");
    if (comma < 0) continue;
    const t = Number(part.slice(0, comma));
    const p = Number(part.slice(comma + 1));
    if (Number.isFinite(t) && Number.isFinite(p)) points.push({ t, p });
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
