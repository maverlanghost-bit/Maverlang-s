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
 * Valor con la tenencia de hoy: acciones × precio histórico + USDC actual.
 * No reconstruye las compras. `shares` ya incluye el multiplicador.
 * El último punto es `totalUsd`, así el gráfico cierra en el total del header.
 */
export function portfolioValueSeries(
  positions: readonly Pick<Position, "shares">[],
  histories: readonly (readonly PricePoint[])[],
  cashUsdc: number,
  totalUsd: number,
): PricePoint[] {
  if (positions.length === 0 || histories.length !== positions.length) return [];
  let length = histories[0]?.length ?? 0;
  for (const series of histories) {
    if (series.length < length) length = series.length;
  }
  if (length < 2) return [];

  const points: PricePoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const stamp = histories[0]?.[index]?.t;
    if (stamp === undefined) continue;
    let value = cashUsdc;
    for (let slot = 0; slot < positions.length; slot += 1) {
      const price = histories[slot]?.[index]?.p;
      if (price === undefined) continue;
      value += (positions[slot]?.shares ?? 0) * price;
    }
    points.push({ t: stamp, p: index === length - 1 ? totalUsd : cents(value) });
  }
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
