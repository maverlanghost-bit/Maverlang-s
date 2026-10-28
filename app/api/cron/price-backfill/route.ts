import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { handle } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { safeJobError } from "@/lib/market/cron-safe";
import { runCoinGeckoBackfillJob } from "@/lib/market/price-cron-job";
import {
  assertPriceTicksWritable,
  listVisiblePriceAssets,
  symbolsWithHistory,
  writePriceTicks,
} from "@/lib/services/price-ticks.supabase";
import { PRICES_TAG } from "@/lib/services/underlying-prices.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby corta cerca de los 60 s. Cada símbolo se escribe antes del siguiente. */
export const maxDuration = 60;

/**
 * Historia real (gráficos 1D/1W/1M). Vercel lo llama a diario
 * (`Authorization: Bearer *** — ver `vercel.json`). Sin token → 401.
 * Sin `CRON_SECRET` → 503 "cron deshabilitado".
 *
 * Pide a CoinGecko el chart de los activos visibles que todavía no tienen
 * fila `coingecko`. Una corrida no alcanza para todo el catálogo: el script
 * `scripts/price-backfill.mjs` hace el pase completo. Sin id en CoinGecko
 * no se inventa una serie.
 */
function assertCronSecret(req: Request): void {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) throw new DomainError("REAL_DISABLED", "Cron deshabilitado.");
  const header = req.headers.get("authorization")?.trim() ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    throw new DomainError("UNAUTHORIZED");
  }
}

const BUDGET_MS = 45_000;
const CAP = 12;
const DAYS = 365;

function emptyResult(dbError: string | null) {
  return {
    backfilled: 0,
    pending: 0,
    points: 0,
    noId: 0,
    rateLimited: false,
    dbError,
    remaining: 0,
    idMap: 0,
  };
}

export function GET(req: Request) {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const started = Date.now();
    let result = emptyResult(null);
    const blocked = await assertPriceTicksWritable();
    if (blocked) {
      result = emptyResult(blocked);
    } else {
      try {
        const assets = await listVisiblePriceAssets();
        const apiKey = serverEnv.COINGECKO_API_KEY;
        result = await runCoinGeckoBackfillJob({
          assets,
          apiKey,
          days: DAYS,
          cap: CAP,
          paceMs: apiKey?.trim() ? 250 : 1_100,
          deadline: started + BUDGET_MS,
          idMapRetries: 1,
          hasHistory: (symbols) => symbolsWithHistory("coingecko", symbols),
          write: (ticks) => writePriceTicks(ticks),
        });
      } catch (error) {
        result = emptyResult(safeJobError(error));
      }
    }
    try {
      revalidateTag(PRICES_TAG, "max");
    } catch {
      // Un fallo de caché no borra lo ya escrito en price_ticks.
    }
    return result;
  });
}
