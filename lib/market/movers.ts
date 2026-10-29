import { z } from "zod";

import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { downsample } from "@/lib/market/browse";
import type { MarketSession } from "@/lib/types";

/** Ficha del S&P 500 en el catálogo (xStocks). */
export const SPY_SYMBOL = "SPYx";
export const MOVERS_LIMIT = 5;
export const SPARK_MAX = 24;
const DAY_MS = 86_400_000;
const NY = "America/New_York";
const OPEN_MINUTES = 9 * 60 + 30;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type MarketPhase = "open" | "pre" | "after" | "closed";

export interface OfferedName {
  symbol: string;
  name: string;
  logoUrl: string | null;
  underlying: string;
  liquidityUsd: number | null;
}

export interface MoverCard {
  symbol: string;
  name: string;
  logoUrl: string | null;
  /** Ratio: 0,012 es +1,2 %. */
  changePct: number;
  spark: number[];
}

export interface TodayBoard {
  gainers: MoverCard[];
  losers: MoverCard[];
  viewed: MoverCard[];
  spy: MoverCard | null;
}

export interface TodayDeps {
  listOffered(): Promise<OfferedName[]>;
  /** Observaciones de `price_ticks`. Vacío si no hay. */
  readTicks(symbol: string): Promise<{ t: number; p: number }[]>;
  /** Cierres de `underlying_prices` del subyacente. Vacío si no hay. */
  readCloses(underlying: string): Promise<{ t: number; p: number }[]>;
  now?: number;
  concurrency?: number;
}

const moverCardSchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().min(1),
    logoUrl: z.string().nullable(),
    changePct: z.number().finite(),
    spark: z.array(z.number().finite()).min(2).max(SPARK_MAX),
  })
  .strict();

export const todayBoardSchema = z
  .object({
    gainers: z.array(moverCardSchema).max(MOVERS_LIMIT),
    losers: z.array(moverCardSchema).max(MOVERS_LIMIT),
    viewed: z.array(moverCardSchema).max(MOVERS_LIMIT),
    spy: moverCardSchema.nullable(),
  })
  .strict();

interface RankRow extends MoverCard {
  observations: number;
  liquidityUsd: number | null;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function cleanPoints(points: readonly { t: number; p: number }[]): { t: number; p: number }[] {
  return points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0)
    .sort((a, b) => a.t - b.t || a.p - b.p);
}

/**
 * Ventana del día. Con cierres diarios, los dos últimos.
 * Con ticks, las últimas 24 h si alcanzan; si no, los dos últimos.
 */
export function dayWindow(
  points: readonly { t: number; p: number }[],
  now: number,
  daily: boolean,
): { t: number; p: number }[] {
  const clean = cleanPoints(points);
  if (clean.length < 2) return clean;
  if (daily) return clean.slice(-2);
  const from = now - DAY_MS;
  const recent = clean.filter((point) => point.t >= from);
  return recent.length >= 2 ? recent : clean.slice(-2);
}

/** Variación del día como ratio. null si no hay dos precios. */
export function dayChange(
  points: readonly { t: number; p: number }[],
  now: number,
  daily: boolean,
): number | null {
  const windowed = dayWindow(points, now, daily);
  const first = windowed[0];
  const last = windowed[windowed.length - 1];
  if (!first || !last || windowed.length < 2 || first.p === 0) return null;
  const change = (last.p - first.p) / first.p;
  return Number.isFinite(change) ? change : null;
}

/**
 * Curva del sparkline. `dayChange` sigue midiendo el día (dos cierres o 24 h).
 * Con cierres diarios se dibujan hasta 24 puntos, no una recta de dos.
 * Con ticks, si la ventana de 24 h tiene menos de 6 puntos y la serie limpia
 * tiene más, se usa esa serie (también hasta 24) para que la curva no quede plana.
 */
export function sparkLine(
  points: readonly { t: number; p: number }[],
  now: number,
  daily: boolean,
): number[] {
  const clean = cleanPoints(points);
  let series = clean.slice(-SPARK_MAX);
  if (!daily) {
    const windowed = dayWindow(points, now, false);
    if (!(windowed.length < 6 && clean.length > windowed.length)) series = windowed;
  }
  return downsample(
    series.map((point) => round6(point.p)),
    SPARK_MAX,
  );
}

function nyCivil(instant: Date): { weekday: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag = new Map<string, string>();
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") bag.set(part.type, part.value);
  }
  let hour = Number(bag.get("hour"));
  if (hour === 24) hour = 0;
  return {
    weekday: WEEKDAY[bag.get("weekday") ?? "Sun"] ?? 0,
    hour,
    minute: Number(bag.get("minute")),
  };
}

/**
 * Abierto, premercado, tras el cierre o cerrado.
 * `session` sale del horario que ya calcula la app. El reloj de Nueva York
 * parte el fuera-de-horario en pre (antes de las 09:30) y tras el cierre.
 */
export function marketPhase(session: MarketSession, now: Date): MarketPhase {
  if (session === "regular") return "open";
  if (session === "closed") return "closed";
  const parts = nyCivil(now);
  const minutes = parts.hour * 60 + parts.minute;
  if (parts.weekday >= 1 && parts.weekday <= 5 && minutes < OPEN_MINUTES) return "pre";
  return "after";
}

/** Hora en Chile, 24 h, sin segundos. */
export function formatChileClock(now: Date, locale: "es-CL" | "en"): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Santiago",
  }).format(now);
}

function bySymbol(a: { symbol: string }, b: { symbol: string }): number {
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

/** Tres listas de hasta 5. Suben y bajan no se rellenan con el signo contrario. */
export function rankBoards(rows: readonly RankRow[], limit = MOVERS_LIMIT): Pick<TodayBoard, "gainers" | "losers" | "viewed"> {
  const usable = rows.filter((row) => Number.isFinite(row.changePct));
  const gainers = usable
    .filter((row) => row.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct || bySymbol(a, b))
    .slice(0, limit)
    .map(toCard);
  const losers = usable
    .filter((row) => row.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct || bySymbol(a, b))
    .slice(0, limit)
    .map(toCard);
  const viewed = [...usable]
    .sort((a, b) => {
      const seen = b.observations - a.observations;
      if (seen !== 0) return seen;
      const liquidity = (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1);
      if (liquidity !== 0) return liquidity;
      return bySymbol(a, b);
    })
    .slice(0, limit)
    .map(toCard);
  return { gainers, losers, viewed };
}

function toCard(row: RankRow): MoverCard {
  return {
    symbol: row.symbol,
    name: row.name,
    logoUrl: row.logoUrl,
    changePct: round6(row.changePct),
    spark: row.spark.map(round6),
  };
}

export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  if (items.length === 0) return out;
  let next = 0;
  const runners = Math.min(Math.max(1, limit), items.length);
  async function run(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      out[index] = await worker(item, index);
    }
  }
  await Promise.all(Array.from({ length: runners }, () => run()));
  return out;
}

function spyPlaceholder(): OfferedName {
  return {
    symbol: SPY_SYMBOL,
    name: "S&P 500",
    logoUrl: logoPathFromSymbol(SPY_SYMBOL),
    underlying: "SPY",
    liquidityUsd: null,
  };
}

/**
 * Arma el día con las fichas ofrecidas.
 * Si hay ticks, mandan (el día en curso). Si no, los dos últimos cierres.
 * "Más vistos" ordena por cuántas observaciones hay en `price_ticks`;
 * si empatan, por la liquidez del catálogo. No es una selección editorial.
 */
export async function loadTodayBoard(deps: TodayDeps): Promise<TodayBoard> {
  const now = deps.now ?? Date.now();
  const offered = await deps.listOffered();
  const bySymbol = new Map<string, OfferedName>();
  for (const asset of offered) {
    const symbol = asset.symbol.trim();
    if (!symbol || bySymbol.has(symbol)) continue;
    bySymbol.set(symbol, {
      symbol,
      name: asset.name.trim() || symbol,
      logoUrl: asset.logoUrl,
      underlying: asset.underlying.trim(),
      liquidityUsd: asset.liquidityUsd,
    });
  }
  if (!bySymbol.has(SPY_SYMBOL)) bySymbol.set(SPY_SYMBOL, spyPlaceholder());

  const rows = await mapPool([...bySymbol.values()], deps.concurrency ?? 8, async (asset) => {
    const ticks = await deps.readTicks(asset.symbol).catch(() => [] as { t: number; p: number }[]);
    const tickPoints = cleanPoints(ticks);
    const useTicks = tickPoints.length >= 2;
    const points = useTicks
      ? tickPoints
      : cleanPoints(await deps.readCloses(asset.underlying).catch(() => [] as { t: number; p: number }[]));
    const daily = !useTicks;
    if (points.length < 2) return null;
    const rawChange = dayChange(points, now, daily);
    const spark = sparkLine(points, now, daily);
    if (rawChange === null || spark.length < 2) return null;
    const row: RankRow = {
      symbol: asset.symbol,
      name: asset.name,
      logoUrl: asset.logoUrl,
      changePct: round6(rawChange),
      spark,
      observations: useTicks ? tickPoints.length : 0,
      liquidityUsd: asset.liquidityUsd,
    };
    return row;
  });

  const ranked = rows.filter((row): row is RankRow => row !== null);
  const boards = rankBoards(ranked);
  const spyRow = ranked.find((row) => row.symbol === SPY_SYMBOL) ?? null;
  return { ...boards, spy: spyRow ? toCard(spyRow) : null };
}
