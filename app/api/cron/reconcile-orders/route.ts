import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { handle, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { reconcilePendingOrders } from "@/lib/orders/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conciliación de órdenes reales (M72). Vercel la llama con
 * `Authorization: Bearer ***` (ver `vercel.json`); también acepta POST
 * para disparo manual con el mismo token (sin cuerpo).
 * Sin token o con token incorrecto → 401. Sin `CRON_SECRET`
 * configurado → 503 "cron deshabilitado". Si no se pudo leer la tabla
 * de órdenes → 502 UPSTREAM (el monitor lo ve como corrida fallida).
 * En `DATA_MODE=mock` responde 200 con ceros: nada que conciliar.
 */

const reconcileResponseSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(["mock", "live"]),
  scanned: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
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

async function runReconcile(req: Request): Promise<Response> {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const summary = await reconcilePendingOrders();
    // Lectura de la base caída → 502: el cron queda visible como fallido
    // en el monitor en vez de "verde con ceros".
    if (!summary.ok) throw new DomainError("UPSTREAM");
    return readOutput(reconcileResponseSchema, summary);
  });
}

export function GET(req: Request): Promise<Response> {
  return runReconcile(req);
}

export function POST(req: Request): Promise<Response> {
  return runReconcile(req);
}
