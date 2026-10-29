import "server-only";
import { unstable_cache } from "next/cache";
import { shouldCacheUnderlyingPoints } from "@/lib/api/contracts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PricePoint, Range } from "@/lib/types";

export const PRICES_TAG = "underlying-prices";
/** 1D sólo si los ticks no alcanzan. ALL pide ~10 años; PostgREST corta en 1000 filas. */
const DAYS: Record<Range, number> = { "1D": 3, "1W": 8, "1M": 32, "3M": 93, "1Y": 366, ALL: 3650 };
const PAGE = 1000;
/** ALL son varias páginas. Si la base no responde, no se sostiene la ficha. */
const CLOSE_BUDGET_MS = 2_500;
/** `unstable_cache` no persiste un throw. Un vacío o un fallo no quedan una hora. */
const MISS = "underlying-closes-miss";

function toPoints(rows: readonly { date: unknown; close: unknown }[]): PricePoint[] {
  // Cierre a las 16:00 de NY ≈ 20:00/21:00 UTC; se usa 20:00Z como marca del día.
  return rows
    .map((row) => ({ t: Date.parse(`${String(row.date)}T20:00:00Z`), p: Number(row.close) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
}

function missError(cause?: unknown): Error {
  const miss = new Error(MISS);
  miss.name = "UnderlyingClosesMiss";
  if (cause !== undefined) miss.cause = cause;
  return miss;
}

async function queryUnderlyingCloses(underlying: string, range: Range): Promise<PricePoint[]> {
  const admin = createSupabaseAdminClient();
  const from = new Date(Date.now() - DAYS[range] * 864e5).toISOString().slice(0, 10);
  const points: PricePoint[] = [];
  const started = Date.now();
  for (let offset = 0; offset < DAYS.ALL + PAGE; offset += PAGE) {
    const remaining = CLOSE_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) throw missError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const { data, error } = await admin
        .from("underlying_prices")
        .select("date,close")
        .eq("underlying", underlying)
        .gte("date", from)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE - 1)
        .abortSignal(controller.signal);
      if (error) throw error;
      if (!data || data.length === 0) break;
      points.push(...toPoints(data as { date: unknown; close: unknown }[]));
      if (data.length < PAGE) break;
    } catch (error) {
      if (isMiss(error)) throw error;
      throw missError(error);
    } finally {
      clearTimeout(timer);
    }
  }
  return points;
}

function isMiss(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === MISS || error.name === "UnderlyingClosesMiss") return true;
  return isMiss(error.cause);
}

const cachedUnderlyingCloses = unstable_cache(
  async (underlying: string, range: Range): Promise<PricePoint[]> => {
    const points = await queryUnderlyingCloses(underlying, range);
    if (!shouldCacheUnderlyingPoints(points.length)) {
      const miss = new Error(MISS);
      miss.name = "UnderlyingClosesMiss";
      throw miss;
    }
    return points;
  },
  // v3 abandona entradas vacías guardadas una hora bajo v2.
  ["underlying-closes-v3"],
  { revalidate: 3600, tags: [PRICES_TAG] },
);

export async function readUnderlyingCloses(underlying: string, range: Range): Promise<PricePoint[]> {
  try {
    return await cachedUnderlyingCloses(underlying, range);
  } catch (error) {
    if (isMiss(error)) return [];
    throw error;
  }
}
