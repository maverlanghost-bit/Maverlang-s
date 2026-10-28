import { timingSafeEqual } from "node:crypto";

import { priceAlertCronResponseSchema } from "@/lib/api/contracts";
import { handle, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { runDailyPriceAlerts } from "@/lib/services/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby corta cerca de los 60 s. El presupuesto interno es menor. */
export const maxDuration = 60;

/**
 * Avisos de precio, una vez al día (22:45 UTC, ver `vercel.json`).
 * `Authorization: Bearer ***`. Sin `CRON_SECRET` → 503. Token malo → 401.
 * En mock o sin tabla responde 200 con ceros: no usa precios de relleno.
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

export function GET(req: Request) {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const summary = await runDailyPriceAlerts();
    return readOutput(priceAlertCronResponseSchema, summary);
  });
}
