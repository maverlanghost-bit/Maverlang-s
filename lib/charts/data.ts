import type { Currency, HistoryMetadata, PricePoint, Quote } from "@/lib/types";

export interface FinancialPoint extends PricePoint {
  /** Only comparison views carry an observation forward; retain its actual date. */
  observedAt?: number;
  gap?: boolean;
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

const BAR_MS: Partial<Record<HistoryMetadata["resolution"], number>> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
  "1wk": 7 * 86_400_000,
};

/** Duración de una barra según la resolución observada; undefined si no es regular. */
export function barDurationMs(resolution: HistoryMetadata["resolution"] | undefined): number | undefined {
  return resolution ? BAR_MS[resolution] : undefined;
}

/**
 * Lleva el precio actual a la última barra del token: la cierra en el spot y
 * ensancha su máximo/mínimo. Si ya empezó otra barra, agrega una que abre en el
 * cierre anterior. No toca barras anteriores ni inventa aperturas.
 */
function spotIntoBars(rows: FinancialPoint[], spot: PricePoint, barMs: number): FinancialPoint[] {
  const last = rows[rows.length - 1];
  if (!last || spot.t < last.t || !Number.isFinite(spot.p) || spot.p <= 0) return rows;
  const bucket = Math.floor(spot.t / barMs) * barMs;
  const prevClose = last.c ?? last.p;
  if (bucket <= last.t) {
    const merged: FinancialPoint = {
      ...last,
      p: spot.p,
      c: spot.p,
      h: Math.max(last.h ?? prevClose, spot.p),
      l: Math.min(last.l ?? prevClose, spot.p),
    };
    return [...rows.slice(0, -1), merged];
  }
  return [...rows, { t: bucket, p: spot.p, o: prevClose, h: Math.max(prevClose, spot.p), l: Math.min(prevClose, spot.p), c: spot.p }];
}

/**
 * Preserves historical prices; never rescales them to the current quote.
 * `barMs` (sólo series de barras del token) deja que el spot actualice la barra en curso.
 */
export function observedSeries(points: readonly FinancialPoint[], spot?: PricePoint, barMs?: number): FinancialPoint[] {
  const rows = chartPoints(points);
  const last = rows[rows.length - 1];
  // Compare real observation times before chartPoints rounds to seconds; an
  // older quote in the same second must not replace a newer historical tick.
  const lastObservedAt = points.reduce((latest, row) => Number.isFinite(row.t) && row.t > 0 && Number.isFinite(row.p) && row.p > 0 ? Math.max(latest, row.t) : latest, 0);
  // A quote is not a complete bar. Keep the provider's bars intact even when
  // token spot and historical instrument happen to be compatible.
  const hasBars = rows.some((row) => [row.o, row.h, row.l, row.c, row.v].some((value) => value !== undefined));
  if (spot && last && hasBars && barMs && spot.t >= lastObservedAt) return spotIntoBars(rows, spot, barMs);
  if (!spot || !last || spot.t < lastObservedAt || hasBars) return rows;
  return chartPoints([...rows, spot]);
}

export function validOhlc(row: FinancialPoint): boolean {
  return !row.gap && [row.o, row.h, row.l, row.c].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    && row.h! >= Math.max(row.o!, row.c!) && row.l! <= Math.min(row.o!, row.c!)
    && row.p === row.c;
}

/** Fields alone do not establish the instrument, resolution or volume unit. */
export function chartCapabilities(points: readonly FinancialPoint[], metadata?: HistoryMetadata) {
  if (!metadata) return { ohlc: false, volume: false };
  const complete = points.length >= 2 && points.every((row) => !row.gap && (row.observedAt === undefined || row.observedAt === row.t));
  const resolved = ["15m", "1h", "1d", "1wk"].includes(metadata.resolution);
  const verified = resolved && metadata.provider !== "unknown" && metadata.provider !== "mixed" && metadata.instrument !== "demo";
  return {
    ohlc: Boolean(complete && verified && metadata.capabilities.ohlc && points.every(validOhlc)),
    volume: Boolean(complete && verified && metadata.capabilities.volume
      && metadata.instrument === "underlying" && metadata.volumeUnit === "underlying_shares" && metadata.volumeScope === "underlying_market"
      && points.every((row) => typeof row.v === "number" && Number.isFinite(row.v) && row.v >= 0)),
  };
}

export function chartVolumeLabel(metadata: HistoryMetadata | undefined, en: boolean): string | undefined {
  return metadata?.volumeUnit === "underlying_shares" && metadata.volumeScope === "underlying_market"
    ? en ? "Underlying volume (shares)" : "Volumen del subyacente (acciones)"
    : undefined;
}

export function resolutionLabel(resolution: HistoryMetadata["resolution"] | undefined, en: boolean): string | null {
  if (resolution === "15m") return en ? "15-minute bars" : "Barras de 15 minutos";
  if (resolution === "1h") return en ? "Hourly bars" : "Barras de 1 hora";
  if (resolution === "1d") return en ? "Daily observations" : "Registros diarios";
  if (resolution === "1wk") return en ? "Weekly bars" : "Barras semanales";
  if (resolution === "irregular") return en ? "Irregular observations" : "Registros de frecuencia irregular";
  return null;
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

/** Built-in line series connect whitespace. Separate runs make visual gaps real. */
export function chartSegments(points: readonly FinancialPoint[]): FinancialPoint[][] {
  const segments: FinancialPoint[][] = [];
  let current: FinancialPoint[] = [];
  for (const point of points) {
    if (point.gap) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function pricePrecision(value: number, currency: Currency = "USD"): number {
  const abs = Math.abs(value);
  if (currency === "CLP" && abs >= 10) return 0;
  if (abs >= 1 || abs === 0) return 2;
  return Math.min(12, Math.max(4, Math.ceil(-Math.log10(abs)) + 2));
}

export function historyDescription(source: string | undefined, en: boolean, provider?: HistoryMetadata["provider"]): string {
  if (source === "ticks" && provider === "geckoterminal") return en ? "Token price on Solana · on-chain pools" : "Precio del token en Solana · pozos on-chain";
  if (source === "ticks") return en ? "Token price history" : "Historial del precio del token";
  if (source === "closes") return en ? "Underlying closes · reference" : "Cierres del subyacente · referencia";
  if (source === "mock") return en ? "Demonstration history" : "Historial de demostración";
  return en ? "History unavailable" : "Historial no disponible";
}
