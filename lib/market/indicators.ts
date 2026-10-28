/**
 * Indicadores del gráfico. Cuentan con los precios que llegan (cierres diarios
 * o la serie del rango). No rellenan huecos: si no alcanza el período, el
 * valor es null y la UI no dibuja esa serie.
 */

import type { Range } from "@/lib/types";

export const SPY_SYMBOL = "SPYx";
export const SMA_PERIODS = [20, 50, 200] as const;
export type SmaPeriod = (typeof SMA_PERIODS)[number];
export const RSI_PERIOD = 14;

export interface TimedPrice {
  t: number;
  p: number;
}

/** Porcentaje desde `base`. 100 con base 100 es 0; 110 es 10. */
export function percentFrom(price: number, base: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(base) || !(base > 0)) return null;
  const pct = (price / base - 1) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** Precios positivos, ordenados por tiempo. En el mismo ms se queda el último. */
export function positiveRows(points: readonly TimedPrice[]): TimedPrice[] {
  const sorted: TimedPrice[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.p) || !(point.p > 0)) continue;
    sorted.push({ t: point.t, p: point.p });
  }
  sorted.sort((a, b) => a.t - b.t);
  const rows: TimedPrice[] = [];
  for (const point of sorted) {
    const prev = rows[rows.length - 1];
    if (prev && prev.t === point.t) {
      prev.p = point.p;
      continue;
    }
    rows.push(point);
  }
  return rows;
}

/** Puntos con `t` dentro de [start, end], ordenados. */
export function windowPoints<T extends { t: number }>(points: readonly T[], start: number, end: number): T[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const picked: T[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.t) || point.t < start || point.t > end) continue;
    picked.push(point);
  }
  picked.sort((a, b) => a.t - b.t);
  return picked;
}

/**
 * Media móvil simple. El índice i es null hasta tener `period` precios
 * finitos seguidos que terminen en i.
 */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (!Number.isInteger(period) || period < 1) return out;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const sample = values[j];
      if (sample === undefined || !Number.isFinite(sample)) {
        ok = false;
        break;
      }
      sum += sample;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

/**
 * RSI de Wilder. El primer valor cae en el índice `period` (hace falta un
 * cambio por cada período). Si la pérdida media es 0, el índice queda en 100
 * (también en una serie plana): es la definición del indicador, no un precio.
 * Un precio que no es finito corta la serie: lo ya calculado se conserva y
 * el resto queda null.
 */
export function rsi(values: readonly number[], period = RSI_PERIOD): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (!Number.isInteger(period) || period < 1 || values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === undefined || curr === undefined || !Number.isFinite(prev) || !Number.isFinite(curr)) {
      return out;
    }
    const change = curr - prev;
    if (change > 0) gainSum += change;
    else if (change < 0) lossSum += -change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiValue(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === undefined || curr === undefined || !Number.isFinite(prev) || !Number.isFinite(curr)) {
      return out;
    }
    const change = curr - prev;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const next = rsiValue(avgGain, avgLoss);
    if (next === null) return out;
    out[i] = next;
  }
  return out;
}

function rsiValue(avgGain: number, avgLoss: number): number | null {
  if (!Number.isFinite(avgGain) || !Number.isFinite(avgLoss)) return null;
  if (avgLoss === 0) return 100;
  const relative = avgGain / avgLoss;
  if (!Number.isFinite(relative)) return null;
  const value = 100 - 100 / (1 + relative);
  return Number.isFinite(value) ? value : null;
}

/**
 * Variación porcentual desde el primer precio positivo, o desde `basePrice`
 * si se pasa. El primer punto propio queda en 0. Ordena y descarta precios
 * que no son positivos.
 */
export function rebase(points: readonly TimedPrice[], basePrice?: number): TimedPrice[] {
  const rows = positiveRows(points);
  const first = rows[0];
  if (!first) return [];
  const base = basePrice === undefined ? first.p : basePrice;
  const out: TimedPrice[] = [];
  for (const row of rows) {
    const pct = percentFrom(row.p, base);
    if (pct === null) continue;
    out.push({ t: row.t, p: pct });
  }
  return out;
}

function seriesFrom(
  points: readonly TimedPrice[],
  values: readonly (number | null)[],
  window?: { start: number; end: number },
): TimedPrice[] {
  const out: TimedPrice[] = [];
  for (let i = 0; i < points.length; i++) {
    const row = points[i];
    const value = values[i];
    if (!row || value === null || !Number.isFinite(value)) continue;
    if (window && (row.t < window.start || row.t > window.end)) continue;
    out.push({ t: row.t, p: value });
  }
  return out;
}

/** SMA alineada al tiempo de cada cierre. El promedio usa cierres anteriores a la ventana. */
export function smaSeries(
  points: readonly TimedPrice[],
  period: number,
  window?: { start: number; end: number },
): TimedPrice[] {
  const rows = positiveRows(points);
  return seriesFrom(
    rows,
    sma(
      rows.map((row) => row.p),
      period,
    ),
    window,
  );
}

/** RSI alineado al tiempo de cada cierre. Igual que `smaSeries`, la ventana sólo recorta. */
export function rsiSeries(
  points: readonly TimedPrice[],
  period = RSI_PERIOD,
  window?: { start: number; end: number },
): TimedPrice[] {
  const rows = positiveRows(points);
  return seriesFrom(
    rows,
    rsi(
      rows.map((row) => row.p),
      period,
    ),
    window,
  );
}

export interface StudySource {
  points: readonly TimedPrice[];
  /** true cuando la serie es referencia (mock o sin datos reales). */
  reference: boolean;
}

export interface StudyInput {
  symbol: string;
  range: Range;
  /** El gráfico visible ya está marcado como referencia. */
  illustrative: boolean;
  window: { start: number; end: number } | null;
  spy: StudySource | null;
  /** Cierres largos (ALL). null si todavía no hay respuesta. */
  closes: StudySource | null;
}

export interface ChartStudies {
  spyPoints: TimedPrice[];
  sma: Record<SmaPeriod, TimedPrice[]>;
  rsi: TimedPrice[];
}

function emptySma(): Record<SmaPeriod, TimedPrice[]> {
  return { 20: [], 50: [], 200: [] };
}

/**
 * Series que sí se pueden dibujar. No mezcla una serie de referencia con una
 * real. En 1D no hay medias. SPYx no se compara consigo mismo. Sin dos puntos
 * dentro de la ventana, la serie queda vacía.
 */
export function chartStudies(input: StudyInput): ChartStudies {
  const sma = emptySma();
  let spyPoints: TimedPrice[] = [];
  const sameKind = (source: StudySource | null): source is StudySource =>
    source !== null && source.reference === input.illustrative;

  if (!isSpySymbol(input.symbol) && sameKind(input.spy) && input.window) {
    const inWindow = windowPoints(positiveRows(input.spy.points), input.window.start, input.window.end);
    if (inWindow.length >= 2) spyPoints = inWindow;
  }

  let rsiPoints: TimedPrice[] = [];
  if (sameKind(input.closes) && input.window) {
    if (input.range !== "1D") {
      for (const period of SMA_PERIODS) {
        const series = smaSeries(input.closes.points, period, input.window);
        sma[period] = series.length >= 2 ? series : [];
      }
    }
    const series = rsiSeries(input.closes.points, RSI_PERIOD, input.window);
    rsiPoints = series.length >= 2 ? series : [];
  }

  return { spyPoints, sma, rsi: rsiPoints };
}

function isSpySymbol(symbol: string): boolean {
  return symbol.trim().toUpperCase() === SPY_SYMBOL.toUpperCase();
}
