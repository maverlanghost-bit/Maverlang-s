import { timingSafeEqual } from "node:crypto";

import { handle } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { safeJobError } from "@/lib/market/cron-safe";
import { runJupiterTickJob } from "@/lib/market/price-cron-job";
import {
  assertPriceTicksWritable,
  listVisiblePriceAssets,
  writePriceTicks,
} from "@/lib/services/price-ticks.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby corta cerca de los 60 s. El presupuesto interno es menor para alcanzar a escribir. */
export const maxDuration = 60;

/**
 * Spot real para los gráficos. Vercel lo llama una vez al día
 * (`Authorization: Bearer *** — ver `vercel.json`). Sin token → 401.
 * Sin `CRON_SECRET` → 503 "cron deshabilitado".
 *
 * Lee los activos visibles del catálogo y guarda el precio que Jupiter
 * devuelve (`usdPrice`, o el del subyacente si no hay `priceChange24h`).
 * No usa `PRICES_MODE`: una lista vacía no es el catálogo, y un precio mock
 * no se escribe. Si la base falla, `dbError` lo dice (no un 0 silencioso).
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

export function GET(req: Request) {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const started = Date.now();
    const blocked = await assertPriceTicksWritable();
    if (blocked) return { recorded: 0, candidates: 0, quoted: 0, dbError: blocked, rateLimited: false };
    try {
      const assets = await listVisiblePriceAssets();
      const result = await runJupiterTickJob({
        assets,
        priceUrl: serverEnv.JUPITER_BASE_URL,
        apiKey: serverEnv.JUPITER_API_KEY,
        now: started,
        deadline: started + BUDGET_MS,
        write: (ticks) => writePriceTicks(ticks),
      });
      return {
        recorded: result.recorded,
        candidates: result.candidates,
        quoted: result.quoted,
        dbError: result.dbError,
        rateLimited: result.rateLimited,
      };
    } catch (error) {
      return { recorded: 0, candidates: 0, quoted: 0, dbError: safeJobError(error), rateLimited: false };
    }
  });
}
