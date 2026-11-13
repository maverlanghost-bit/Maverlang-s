import "server-only";

import { mapPositions, type MappedPosition } from "@/lib/copy/mapping";
import type { CopyPortfolio } from "@/lib/copy/types";
import { ticksIfEnough } from "@/lib/services/history-series";
import { readHistory } from "@/lib/services/price-ticks.supabase";
import type { PricePoint, Range } from "@/lib/types";

/**
 * Curva de rendimiento ESTIMADA de una cartera, calculada sólo con precios e
 * historial PROPIOS de Maverlang (`price_ticks`, vía `readHistory`). El arreglo
 * `performance[]` del feed de Fraccion.si se ignora: no se republica la serie
 * de Yahoo ni ninguna serie de terceros.
 *
 * Cómo se arma: se toma la composición ACTUAL mapeada a tokens operables, se
 * pondera cada pierna por su peso declarado y se encadena el retorno de cada
 * una desde su primer precio observado en el rango. El resultado es un índice
 * base 100 al inicio de la ventana (`points[].p`, no dólares), con línea
 * punteada y la etiqueta «Estimado: composición actual hacia atrás, con precios
 * de Maverlang».
 *
 * Sin historial suficiente devuelve `null`: NUNCA se inventan series ni se
 * rellenan huecos con ruido. `estimated` es siempre `true`.
 */

/** Base del índice de la curva. */
export const COPY_PERF_BASE = 100;
/** Tope de piernas con lectura de historial (las de mayor peso). */
export const COPY_PERF_MAX_LEGS = 20;
/** Tope de puntos devueltos: el gráfico es un SVG liviano. */
export const COPY_PERF_MAX_POINTS = 160;
/**
 * Si el historial disponible cubre menos de la mitad del peso mapeado, la curva
 * sería engañosa: se devuelve `null` y la ficha dice «sin historial».
 */
export const COPY_PERF_MIN_WEIGHT_SHARE = 0.5;

export interface CopyPerformanceSeries {
  /** Índice base 100 (no USD), ordenado por tiempo ascendente. */
  points: PricePoint[];
  /** Siempre true: es una proyección hacia atrás de la composición actual. */
  estimated: true;
}

export interface EstimatePerformanceOptions {
  /** Sólo pruebas o llamadas internas: posiciones ya mapeadas. */
  mapped?: readonly MappedPosition[];
  deps?: {
    /** Sólo pruebas: lector de historial inyectado. */
    readHistory?: (symbol: string, range: Range) => Promise<PricePoint[]>;
    /** Sólo pruebas: reloj inyectado. */
    now?: () => number;
  };
}

interface Leg {
  weight: number;
  points: PricePoint[];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Ordena, deduplica por tiempo y descarta precios imposibles. */
function sanitize(points: readonly PricePoint[]): PricePoint[] {
  const clean: PricePoint[] = [];
  for (const point of points as readonly (PricePoint | null | undefined)[]) {
    if (!point || typeof point !== "object") continue;
    if (!Number.isFinite(point.t) || !Number.isFinite(point.p) || point.p <= 0) continue;
    clean.push({ t: point.t, p: point.p });
  }
  clean.sort((left, right) => left.t - right.t);
  const dedup: PricePoint[] = [];
  for (const point of clean) {
    const last = dedup[dedup.length - 1];
    if (last && last.t === point.t) dedup[dedup.length - 1] = point;
    else dedup.push(point);
  }
  return dedup;
}

/** Reduce a `max` puntos repartidos parejo, conservando primero y último. */
function downsample(points: readonly PricePoint[], max: number): PricePoint[] {
  if (points.length <= max) return [...points];
  const step = (points.length - 1) / (max - 1);
  const out: PricePoint[] = [];
  for (let index = 0; index < max; index += 1) {
    const point = points[Math.round(index * step)];
    const last = out[out.length - 1];
    if (last && last.t === point.t) continue;
    out.push(point);
  }
  return out;
}

async function readLegPoints(
  symbol: string,
  range: Range,
  read: (symbol: string, range: Range) => Promise<PricePoint[]>,
): Promise<PricePoint[]> {
  try {
    return sanitize(await read(symbol, range));
  } catch {
    // Sin Supabase configurado o con la consulta caída: esa pierna no aporta.
    return [];
  }
}

/**
 * `estimatePerformance(portfolio, range)`: serie estimada o `null`. Nunca
 * lanza por falta de datos; el gráfico muestra «sin historial».
 */
export async function estimatePerformance(
  portfolio: CopyPortfolio,
  range: Range,
  options: EstimatePerformanceOptions = {},
): Promise<CopyPerformanceSeries | null> {
  const positions = portfolio?.positions ?? [];
  if (positions.length === 0) return null;

  const mapped =
    options.mapped ??
    (await mapPositions(positions, {
      family: portfolio.portfolio?.family,
      deps: options.deps?.now ? { now: options.deps.now } : undefined,
    }));

  const buyable = mapped
    .filter(
      (row) =>
        row.status === "available" && row.tradableSymbol !== null && row.weightOriginal > 0,
    )
    .sort((left, right) => right.weightOriginal - left.weightOriginal)
    .slice(0, COPY_PERF_MAX_LEGS);
  if (buyable.length === 0) return null;

  const totalWeight = buyable.reduce((sum, row) => sum + row.weightOriginal, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;

  const read =
    options.deps?.readHistory ??
    ((symbol: string, window: Range) => readHistory(symbol, window, options.deps?.now?.()));
  const history = await Promise.all(
    buyable.map((row) => readLegPoints(row.tradableSymbol ?? "", range, read)),
  );

  const legs: Leg[] = [];
  buyable.forEach((row, index) => {
    const enough = ticksIfEnough(history[index], 2);
    if (!enough) return;
    legs.push({ weight: row.weightOriginal, points: enough });
  });
  if (legs.length === 0) return null;

  const coveredWeight = legs.reduce((sum, leg) => sum + leg.weight, 0);
  if (coveredWeight / totalWeight < COPY_PERF_MIN_WEIGHT_SHARE) return null;

  // Grilla de tiempos: unión de las observaciones de todas las piernas.
  const times = [...new Set(legs.flatMap((leg) => leg.points.map((point) => point.t)))].sort(
    (left, right) => left - right,
  );
  const cursors = new Array<number>(legs.length).fill(-1);
  // La curva parte cuando ya hay datos de al menos la mitad del peso.
  const minWeight = coveredWeight * COPY_PERF_MIN_WEIGHT_SHARE;
  const curve: PricePoint[] = [];

  for (const time of times) {
    let weightWithData = 0;
    let weightedReturn = 0;
    legs.forEach((leg, index) => {
      const points = leg.points;
      let cursor = cursors[index];
      while (cursor + 1 < points.length && points[cursor + 1].t <= time) cursor += 1;
      cursors[index] = cursor;
      if (cursor < 0) return;
      const base = points[0].p;
      if (!(base > 0)) return;
      weightedReturn += leg.weight * (points[cursor].p / base);
      weightWithData += leg.weight;
    });
    if (weightWithData < minWeight || weightWithData <= 0) continue;
    curve.push({ t: time, p: round((weightedReturn / weightWithData) * COPY_PERF_BASE, 4) });
  }

  if (curve.length < 2) return null;
  // La ventana dibujada parte en 100: cada punto es el índice de la mezcla
  // desde el primer dato disponible (no desde el inicio del rango nominal).
  const start = curve[0].p;
  if (!(start > 0)) return null;
  const normalized = curve.map((point) => ({
    t: point.t,
    p: round((point.p / start) * COPY_PERF_BASE, 4),
  }));
  return { points: downsample(normalized, COPY_PERF_MAX_POINTS), estimated: true };
}
