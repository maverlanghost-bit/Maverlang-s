import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { handle, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { syncSolanaUsdcDeposits } from "@/lib/wallet/deposit-sync";
import { reconcileWalletMovements } from "@/lib/wallet/reconcile-movements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Seguimiento y conciliación de billetera. Vercel la llama con
 * `Authorization: Bearer ***` (ver `vercel.json`). Acepta GET y POST
 * (mismo trabajo) para poder encadenarla a otros orquestadores.
 * Sin token o con token incorrecto → 401. Sin `CRON_SECRET`
 * configurado → 503 "Cron deshabilitado.".
 *
 * Orden: primero se indexan depósitos USDC nuevos (sólo lectura de la
 * cadena + escritura del registro) y después se concilian los movimientos
 * `pending`. Si el barrido no pudo cubrir su alcance (identidad o RPC),
 * la corrida responde 502 UPSTREAM: un monitor no debe ver "verde" una
 * corrida incompleta. En `DATA_MODE=mock` ambos pasos son no-op y responde
 * 200 con ceros (demo/CI no tocan red ni base).
 *
 * El barrido de depósitos es opt-in: en live queda apagado hasta que
 * staging configure `WALLET_DEPOSIT_SYNC=on`. La respuesta lo dice en
 * `deposits.enabled` y el resto del cron sigue funcionando igual.
 */

const depositSyncResponseSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(["mock", "live"]),
  enabled: z.boolean(),
  walletsTotal: z.number().int().nonnegative(),
  walletsScanned: z.number().int().nonnegative(),
  failedWallets: z.number().int().nonnegative(),
  signaturesChecked: z.number().int().nonnegative(),
  detected: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  finalized: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  truncated: z.boolean(),
  durationMs: z.number().int().nonnegative(),
});

const reconcileResponseSchema = z.object({
  reviewed: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  truncated: z.boolean(),
  deposits: depositSyncResponseSchema,
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

async function runWalletCron(req: Request): Promise<Response> {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const deposits = await syncSolanaUsdcDeposits();
    // La conciliación de pendientes corre igual aunque el barrido falle.
    const summary = await reconcileWalletMovements();
    if (!deposits.ok) throw new DomainError("UPSTREAM");
    return readOutput(reconcileResponseSchema, { ...summary, deposits });
  });
}

export function GET(req: Request): Promise<Response> {
  return runWalletCron(req);
}

export function POST(req: Request): Promise<Response> {
  return runWalletCron(req);
}
