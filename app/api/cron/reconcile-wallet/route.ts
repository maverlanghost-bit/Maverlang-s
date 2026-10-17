import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { handle, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { reconcileWalletMovements } from "@/lib/wallet/reconcile-movements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conciliación de movimientos de billetera (M81). Vercel la llama con
 * `Authorization: Bearer ***` (ver `vercel.json`). Acepta GET y POST
 * (mismo trabajo) para poder encadenarla a otros orquestadores.
 * Sin token o con token incorrecto → 401. Sin `CRON_SECRET`
 * configurado → 503 "Cron deshabilitado.".
 */

const reconcileResponseSchema = z.object({
  reviewed: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

/**
 * Compara el token en tiempo constante. Lee `process.env` en la solicitud
 * (igual que `catalog-health`) para que los tests cubran 401/503/200 sin
 * reimportar el módulo.
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
    const summary = await reconcileWalletMovements();
    return readOutput(reconcileResponseSchema, summary);
  });
}

export function POST(req: Request) {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const summary = await reconcileWalletMovements();
    return readOutput(reconcileResponseSchema, summary);
  });
}
