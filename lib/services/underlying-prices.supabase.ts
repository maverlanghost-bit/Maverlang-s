import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PricePoint, Range } from "@/lib/types";

export const PRICES_TAG = "underlying-prices";
const DAYS: Record<Range, number> = { "1W": 8, "1M": 32, "3M": 93, "1Y": 366, ALL: 366 };

export const readUnderlyingCloses = unstable_cache(
  async (underlying: string, range: Range): Promise<PricePoint[]> => {
    const from = new Date(Date.now() - DAYS[range] * 864e5).toISOString().slice(0, 10);
    const { data, error } = await createSupabaseAdminClient()
      .from("underlying_prices")
      .select("date,close")
      .eq("underlying", underlying)
      .gte("date", from)
      .order("date", { ascending: true })
      .limit(2000);
    if (error || !data) return [];
    // Cierre a las 16:00 de NY ≈ 20:00/21:00 UTC; se usa 20:00Z como marca del día.
    return data
      .map((r) => ({ t: Date.parse(`${String(r.date)}T20:00:00Z`), p: Number(r.close) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
  },
  ["underlying-closes-v1"],
  { revalidate: 3600, tags: [PRICES_TAG] },
);
