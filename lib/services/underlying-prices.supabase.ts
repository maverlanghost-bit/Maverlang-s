import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PricePoint, Range } from "@/lib/types";

export const PRICES_TAG = "underlying-prices";
/** 1D sólo si los ticks no alcanzan. ALL pide ~10 años; PostgREST corta en 1000 filas. */
const DAYS: Record<Range, number> = { "1D": 3, "1W": 8, "1M": 32, "3M": 93, "1Y": 366, ALL: 3650 };
const PAGE = 1000;

function toPoints(rows: readonly { date: unknown; close: unknown }[]): PricePoint[] {
  // Cierre a las 16:00 de NY ≈ 20:00/21:00 UTC; se usa 20:00Z como marca del día.
  return rows
    .map((row) => ({ t: Date.parse(`${String(row.date)}T20:00:00Z`), p: Number(row.close) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
}

export const readUnderlyingCloses = unstable_cache(
  async (underlying: string, range: Range): Promise<PricePoint[]> => {
    const admin = createSupabaseAdminClient();
    const from = new Date(Date.now() - DAYS[range] * 864e5).toISOString().slice(0, 10);
    const points: PricePoint[] = [];
    for (let offset = 0; offset < DAYS.ALL + PAGE; offset += PAGE) {
      const { data, error } = await admin
        .from("underlying_prices")
        .select("date,close")
        .eq("underlying", underlying)
        .gte("date", from)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error || !data || data.length === 0) break;
      points.push(...toPoints(data as { date: unknown; close: unknown }[]));
      if (data.length < PAGE) break;
    }
    return points;
  },
  ["underlying-closes-v2"],
  { revalidate: 3600, tags: [PRICES_TAG] },
);
