import "server-only";

/**
 * Conciliación de retiros `submitted` (`wallet_withdrawals`, migración 0051).
 *
 * Complementa `reconcileWalletMovements()` (que concilia `wallet_movements`) y
 * `getWithdrawalStatus()` (que concilia bajo demanda cuando el usuario consulta
 * su envío). Si el cliente cerró la pestaña o el RPC falló de forma ambigua
 * tras `claimSubmit`, este barrido resuelve los retiros `submitted` con firma
 * consultando `getSignatureStatuses` y cerrando el libro vía
 * `finalize_wallet_withdrawal`.
 *
 * Reglas:
 * - En `DATA_MODE=mock` (sin `deps` inyectadas) es no-op y devuelve ceros.
 * - Si el RPC devuelve `null` o `processed`, el retiro sigue `submitted`
 *   (nunca se marca `failed` sin evidencia de error on-chain).
 * - Si el RPC devuelve `confirmed` / `finalized` sin `err`, finaliza como
 *   `confirmed` y actualiza `wallet_movements` en best-effort.
 * - Si el RPC devuelve `err !== null`, finaliza como `failed` con mensaje
 *   traducido y actualiza `wallet_movements` en best-effort.
 */

import { updateWalletMovementStatus } from "@/lib/services/wallet-movements.supabase";
import {
  expireStaleSubmittingWithdrawals,
  finalizeWithdrawalRow,
  listSubmittedWithdrawalRows,
  type SubmittedWithdrawalRow,
} from "@/lib/services/withdrawals.supabase";
import { getServerConnection } from "@/lib/solana/connection";
import { signatureStatusToOrder, type SignatureStatusLike } from "@/lib/solana/signature-status";
import { translateSolanaError } from "@/lib/solana/tx-errors";

export type { SubmittedWithdrawalRow };

export const WITHDRAWAL_RECONCILE_BATCH_LIMIT = 100;
const DEFAULT_SUBMITTED_EXPIRE_MS = 30 * 60 * 1000;

export interface ReconcileWithdrawalsSummary {
  reviewed: number;
  confirmed: number;
  failed: number;
  pending: number;
  skipped: number;
  durationMs: number;
}

export interface ReconcileWithdrawalsDeps {
  listSubmittedWithdrawals: (limit: number) => Promise<SubmittedWithdrawalRow[]>;
  getSignatureStatuses: (signatures: string[]) => Promise<Array<SignatureStatusLike | null>>;
  finalizeWithdrawal: (
    userId: string,
    requestId: string,
    status: "confirmed" | "failed",
    signature: string,
    error: string | null,
  ) => Promise<boolean>;
  updateMovementStatus?: (reference: string, status: "confirmed" | "failed") => Promise<boolean>;
  expireStaleSubmitting?: () => Promise<string[]>;
  submittedExpireMs?: number;
}

function isLiveDataMode(): boolean {
  return (process.env.DATA_MODE?.trim() || "mock") === "live";
}

function emptySummary(durationMs = 0): ReconcileWithdrawalsSummary {
  return {
    reviewed: 0,
    confirmed: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    durationMs,
  };
}

function liveWithdrawalsDeps(): ReconcileWithdrawalsDeps {
  return {
    listSubmittedWithdrawals: (limit) => listSubmittedWithdrawalRows(limit),
    expireStaleSubmitting: () => expireStaleSubmittingWithdrawals(),
    getSignatureStatuses: async (signatures) => {
      if (signatures.length === 0) return [];
      const { value } = await getServerConnection().getSignatureStatuses(signatures, {
        searchTransactionHistory: true,
      });
      return value;
    },
    finalizeWithdrawal: (userId, requestId, status, signature, error) =>
      finalizeWithdrawalRow(userId, requestId, status, signature, error),
    updateMovementStatus: (reference, status) => updateWalletMovementStatus(reference, status),
  };
}

async function updateMovementQuietly(
  updater: ((reference: string, status: "confirmed" | "failed") => Promise<boolean>) | undefined,
  reference: string,
  status: "confirmed" | "failed",
): Promise<void> {
  if (!updater) return;
  try {
    await updater(reference, status);
  } catch {
    // Best effort: el libro de retiros ya quedó con el estado final.
  }
}

/**
 * Concilia retiros en estado `submitted` que ya tienen firma on-chain.
 * En `DATA_MODE=mock` (sin `deps`) retorna ceros sin tocar red ni base.
 */
export async function reconcileSubmittedWithdrawals(
  deps?: ReconcileWithdrawalsDeps,
): Promise<ReconcileWithdrawalsSummary> {
  if (!deps && !isLiveDataMode()) {
    return emptySummary(0);
  }

  const resolved = deps ?? liveWithdrawalsDeps();
  const startedAt = Date.now();
  const expireMs = resolved.submittedExpireMs ?? DEFAULT_SUBMITTED_EXPIRE_MS;

  if (resolved.expireStaleSubmitting) {
    try {
      const expiredRefs = await resolved.expireStaleSubmitting();
      for (const ref of expiredRefs) {
        await updateMovementQuietly(resolved.updateMovementStatus, ref, "failed");
      }
    } catch {
      // Best-effort para limpiar reservas `submitting` vencidas.
    }
  }

  const batch = await resolved.listSubmittedWithdrawals(WITHDRAWAL_RECONCILE_BATCH_LIMIT);
  const withSignature: Array<SubmittedWithdrawalRow & { signature: string }> = [];
  let skipped = 0;

  for (const row of batch) {
    const sig = typeof row.signature === "string" ? row.signature.trim() : "";
    if (!sig) {
      skipped += 1;
      continue;
    }
    withSignature.push({ ...row, signature: sig });
  }

  if (withSignature.length === 0) {
    return {
      reviewed: batch.length,
      confirmed: 0,
      failed: 0,
      pending: 0,
      skipped,
      durationMs: Date.now() - startedAt,
    };
  }

  const statuses = await resolved.getSignatureStatuses(withSignature.map((row) => row.signature));

  let confirmed = 0;
  let failed = 0;
  let pending = 0;

  for (let i = 0; i < withSignature.length; i += 1) {
    const row = withSignature[i]!;
    const rpcStatus = statuses[i] ?? null;
    const decision = signatureStatusToOrder(rpcStatus);

    const createdAtMs = typeof row.createdAt === "string" ? Date.parse(row.createdAt) : Number.NaN;
    const expiredWithoutChain =
      rpcStatus === null &&
      Number.isFinite(createdAtMs) &&
      Date.now() - createdAtMs >= expireMs;

    if (decision.status === "submitted" && !expiredWithoutChain) {
      pending += 1;
      continue;
    }

    const nextStatus: "confirmed" | "failed" =
      decision.status === "confirmed" ? "confirmed" : "failed";
    const errorMessage = expiredWithoutChain
      ? "La transacción expiró sin confirmarse en la red."
      : nextStatus === "failed"
        ? translateSolanaError(rpcStatus?.err).userMessage
        : null;

    let changed = false;
    try {
      changed = await resolved.finalizeWithdrawal(
        row.userId,
        row.requestId,
        nextStatus,
        row.signature,
        errorMessage,
      );
    } catch {
      changed = false;
    }

    if (changed) {
      await updateMovementQuietly(resolved.updateMovementStatus, row.reference, nextStatus);
      if (nextStatus === "confirmed") confirmed += 1;
      else failed += 1;
    }
  }

  return {
    reviewed: batch.length,
    confirmed,
    failed,
    pending,
    skipped,
    durationMs: Date.now() - startedAt,
  };
}
