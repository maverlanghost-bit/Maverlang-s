import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { handle, parseQuery, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { runSafetyBatch } from "@/lib/catalog/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vigilancia del catálogo (M55). Vercel la llama con
 * `Authorization: Bearer ${CRON_SECRET}` (ver `vercel.json`).
 * Sin token o con token incorrecto → 401. Sin `CRON_SECRET`
 * configurado → 503 "cron deshabilitado".
 */

const cronHealthQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

const cronHealthResponseSchema = z.object({
  checked: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

/**
 * Compara el token en tiempo constante. Lee `process.env` en la solicitud
 * (igual que `siteOriginOf` en `handler.ts`) para que los tests puedan
 * cubrir los tres casos (401/503/200) sin reimportar el módulo.
 */
function assertCronSecret(req: Request): void {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  // M55: 503 con el mensaje pedido (se reutiliza el único código 503
  // existente; el mensaje aclara que es el cron, no el dinero real).
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
    const query = parseQuery(req, cronHealthQuerySchema);
    const summary = await runSafetyBatch({ offset: query.offset, limit: query.limit });
    return readOutput(cronHealthResponseSchema, summary);
  });
}
