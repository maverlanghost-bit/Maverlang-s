import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  PendingWalletMovement,
  ReconcileSummary,
  UnifiedWalletMovement,
  WalletMovementKind,
  WalletMovementStatus,
} from "@/lib/wallet/reconcile-movements";

/**
 * Acceso a datos de movimientos unificados (`wallet_movements` y
 * `wallet_reconciliations`, migración 0030). Vive en `lib/services/*.supabase.ts`
 * para no sacar el cliente admin de la lista blanca (M57). Lo consumen la
 * conciliación del cron (M81) y el feed unificado de `wallet_movements` no
 * expone nada al cliente: sólo service_role toca estas tablas (RLS sin
 * políticas, ver 0030).
 */

/** Fila cruda de `wallet_movements` (columnas en snake_case). */
interface WalletMovementRow {
  reference: string;
  user_id: string;
  kind: WalletMovementKind;
  mint: string;
  amount_ui: number;
  status: WalletMovementStatus;
  signature: string | null;
  counterparty_address: string | null;
  created_at: string;
  confirmed_at: string | null;
}

function toUnified(row: WalletMovementRow): UnifiedWalletMovement {
  return {
    kind: row.kind,
    mint: row.mint,
    amountUi: row.amount_ui,
    reference: row.reference,
    status: row.status,
    signature: row.signature,
    createdAt: row.created_at,
  };
}

/** Movimientos pendientes más antiguos primero (lote acotado por la 0030). */
export async function listPendingWalletMovements(limit: number): Promise<PendingWalletMovement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("wallet_movements")
    .select("reference,user_id,kind,mint,amount_ui,signature,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return (data as WalletMovementRow[]).map((row) => ({
    reference: row.reference,
    userId: row.user_id,
    kind: row.kind,
    mint: row.mint,
    amountUi: row.amount_ui,
    signature: row.signature,
    createdAt: row.created_at,
  }));
}

/**
 * Actualiza `confirmed_at`/`last_reconciled_at` sólo cuando el estado cambia:
 * actualizar dos veces `pending → confirmed` cuenta una vez; repetir
 * `confirmed → confirmed` no hace nada (idempotente).
 */
export async function updateWalletMovementStatus(
  reference: string,
  status: Exclude<WalletMovementStatus, "pending">,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("wallet_movements")
    .update({
      status,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
      last_reconciled_at: new Date().toISOString(),
    })
    .eq("reference", reference)
    .neq("status", status)
    .select("reference");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/** Feed unificado por usuario (más recientes primero). */
export async function listUnifiedWalletMovements(userId: string, limit = 100): Promise<UnifiedWalletMovement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("wallet_movements")
    .select("reference,kind,mint,amount_ui,status,signature,created_at,confirmed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as WalletMovementRow[]).map(toUnified);
}

/** Resumen de la corrida en `wallet_reconciliations` (monitoreo de /admin). */
export async function recordWalletReconciliation(summary: ReconcileSummary): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("wallet_reconciliations").insert({
    users_reviewed: summary.reviewed,
    pending_resolved: summary.confirmed + summary.failed,
    external_count: 0,
    unexplained_count: 0,
    duration_ms: summary.durationMs,
    truncated: summary.truncated,
    details: {
      reviewed: summary.reviewed,
      confirmed: summary.confirmed,
      failed: summary.failed,
      pending: summary.pending,
      skipped: summary.skipped,
    },
  });
  if (error) throw error;
}

/**
 * Upsert de un movimiento desde su fuente (depósito M78, on-ramp M80,
 * retiro M79). `reference` es única (0030): repetir no duplica.
 */
export async function upsertWalletMovement(row: {
  userId: string;
  kind: WalletMovementKind;
  mint: string;
  amountUi: number;
  reference: string;
  status: WalletMovementStatus;
  signature: string | null;
  counterpartyAddress: string | null;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("wallet_movements").upsert(
    {
      user_id: row.userId,
      kind: row.kind,
      mint: row.mint,
      amount_ui: row.amountUi,
      reference: row.reference,
      status: row.status,
      signature: row.signature,
      counterparty_address: row.counterpartyAddress,
    },
    { onConflict: "reference", ignoreDuplicates: true },
  );
  return !error;
}
