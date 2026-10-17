import "server-only";

/**
 * M81: conciliación de movimientos de billetera.
 *
 * Dos partes:
 *
 * 1. `reconcileWalletMovements()`: barrido de movimientos `pending`
 *    (`deposit`, `onramp`, `withdraw`) que resuelve su estado consultando
 *    la firma on-chain (`getSignatureStatuses`): `confirmed` (confirmed/
 *    finalized sin error) o `failed` (err on-chain); sin firma (on-ramp
 *    esperando el webhook de M80) queda `pending`. Idempotente: actualizar
 *    un estado dos veces no cuenta dos veces (`reference` única en
 *    `wallet_movements`, la 0030).
 *
 * 2. `mergeUnifiedWalletActivity()`: unifica y deduplica el feed de
 *    movimientos por `reference`/`signature` (la misma transferencia puede
 *    llegar de dos fuentes), ordenado por fecha descendente.
 *
 * INYECTABLE: toda la entrada/salida externa llega por `deps` (producción:
 * `lib/services/wallet-movements.supabase.ts` + RPC de Solana). Sin `deps`
 * usa un registro en memoria: determinista para `DATA_MODE=mock`.
 */

import { signatureStatusToOrder, type SignatureStatusLike } from "@/lib/solana/signature-status";

export type WalletMovementKind = "deposit" | "onramp" | "withdraw";
export type WalletMovementStatus = "pending" | "confirmed" | "failed";

/** Movimiento pendiente tal como sale de `wallet_movements` (0030). */
export interface PendingWalletMovement {
  reference: string;
  userId: string;
  kind: WalletMovementKind;
  mint: string;
  amountUi: number;
  signature: string | null;
  createdAt: string;
}

/** Movimiento unificado del feed (entrada y salida de `mergeUnifiedWalletActivity`). */
export interface UnifiedWalletMovement {
  kind: WalletMovementKind;
  mint: string;
  amountUi: number;
  /** Firma de Solana o referencia del proveedor: llave de deduplicación. */
  reference: string;
  status: WalletMovementStatus;
  signature: string | null;
  createdAt: string;
}

export interface ReconcileDeps {
  /** Movimientos pendientes a revisar (lote acotado). */
  listPendingMovements: (limit: number) => Promise<PendingWalletMovement[]>;
  /** Estado on-chain de cada firma (lo que devuelve `getSignatureStatuses`). */
  getSignatureStatuses: (signatures: string[]) => Promise<Array<SignatureStatusLike | null>>;
  /** Actualiza el estado. `true` si cambió; `false` si ya estaba (idempotente). */
  updateMovementStatus: (reference: string, status: "confirmed" | "failed") => Promise<boolean>;
  /** Resumen de la corrida en `wallet_reconciliations` (opcional). */
  recordRun?: (summary: ReconcileSummary) => Promise<void>;
}

export interface ReconcileSummary {
  /** Movimientos pendientes revisados en esta corrida. */
  reviewed: number;
  /** Pasaron a confirmed en esta corrida. */
  confirmed: number;
  /** Pasaron a failed en esta corrida. */
  failed: number;
  /** Siguieron pending (aún sin confirmación on-chain suficiente). */
  pending: number;
  /** Pendientes sin firma on-chain (on-ramp: espera el webhook de M80). */
  skipped: number;
  durationMs: number;
  /** El lote venía lleno: probablemente quedan más pendientes para la próxima. */
  truncated: boolean;
}

/** Lote por corrida: acota el trabajo del cron (presupuesto de 50 s en la 0030). */
export const RECONCILE_BATCH_LIMIT = 100;

// ---------------------------------------------------------------------------
// Registro en memoria del modo mock (determinista; tests, demo y desarrollo).
// ---------------------------------------------------------------------------

interface MockMovementState extends PendingWalletMovement {
  status: WalletMovementStatus;
  confirmedAt: string | null;
}

const mockMovementStore = new Map<string, MockMovementState>();
/** Estado on-chain fijo del mock: sin registro → `null` (sigue pendiente). */
const mockChainStatuses = new Map<string, SignatureStatusLike>();

/** Sólo tests/desarrollo: limpia los registros en memoria del modo mock. */
export function resetReconcileMockStoreForTests(): void {
  mockMovementStore.clear();
  mockChainStatuses.clear();
}

/** Sólo tests/desarrollo: siembra un movimiento en el registro mock. */
export function seedReconcileMockMovement(movement: PendingWalletMovement, status: WalletMovementStatus = "pending"): void {
  mockMovementStore.set(movement.reference, { ...movement, status, confirmedAt: status === "pending" ? null : new Date(0).toISOString() });
}

/** Sólo tests/desarrollo: fija el estado on-chain que verá el mock. */
export function setReconcileMockChainStatus(signature: string, status: SignatureStatusLike | null): void {
  if (status === null) mockChainStatuses.delete(signature);
  else mockChainStatuses.set(signature, status);
}

function mockReconcileDeps(): ReconcileDeps {
  return {
    listPendingMovements: async (limit) =>
      [...mockMovementStore.values()].filter((m) => m.status === "pending").slice(0, limit),
    getSignatureStatuses: async (signatures) => signatures.map((s) => mockChainStatuses.get(s) ?? null),
    updateMovementStatus: async (reference, status) => {
      const row = mockMovementStore.get(reference);
      if (!row || row.status === status) return false;
      row.status = status;
      row.confirmedAt = status === "confirmed" ? new Date(0).toISOString() : null;
      return true;
    },
  };
}

/** Producción (`DATA_MODE=live`): `wallet_movements` vía cliente admin + RPC. */
async function liveReconcileDeps(): Promise<ReconcileDeps> {
  const [service, { getServerConnection }] = await Promise.all([
    import("@/lib/services/wallet-movements.supabase"),
    import("@/lib/solana/connection"),
  ]);
  return {
    listPendingMovements: (limit) => service.listPendingWalletMovements(limit),
    getSignatureStatuses: async (signatures) => {
      if (signatures.length === 0) return [];
      const { value } = await getServerConnection().getSignatureStatuses(signatures, {
        searchTransactionHistory: true,
      });
      return value;
    },
    updateMovementStatus: (reference, status) => service.updateWalletMovementStatus(reference, status),
    recordRun: (summary) => service.recordWalletReconciliation(summary),
  };
}

function isLiveDataMode(): boolean {
  return (process.env.DATA_MODE?.trim() || "mock") === "live";
}

// ---------------------------------------------------------------------------
// 1. Conciliación
// ---------------------------------------------------------------------------

/**
 * Barrido idempotente de movimientos pendientes. Cada corrida: lista hasta
 * `RECONCILE_BATCH_LIMIT` pendientes, consulta el estado on-chain de las
 * firmas y actualiza `confirmed`/`failed` sólo donde cambia. Los movimientos
 * sin firma (on-ramp) se dejan quietos: su confirmación llega por webhook.
 */
export async function reconcileWalletMovements(deps?: ReconcileDeps): Promise<ReconcileSummary> {
  const resolved = deps ?? (isLiveDataMode() ? await liveReconcileDeps() : mockReconcileDeps());
  const startedAt = Date.now();

  const pendingBatch = await resolved.listPendingMovements(RECONCILE_BATCH_LIMIT);
  const withSignature = pendingBatch.filter((m) => typeof m.signature === "string" && m.signature.trim() !== "");
  const skipped = pendingBatch.length - withSignature.length;

  const statuses = withSignature.length > 0 ? await resolved.getSignatureStatuses(withSignature.map((m) => m.signature as string)) : [];

  let confirmed = 0;
  let failed = 0;
  let stillPending = 0;
  for (let i = 0; i < withSignature.length; i += 1) {
    const movement = withSignature[i]!;
    const decision = signatureStatusToOrder(statuses[i] ?? null);
    if (decision.status === "submitted") {
      // `processed` o sin estado aún: puede revertirse; sigue pendiente.
      stillPending += 1;
      continue;
    }
    const next = decision.status === "confirmed" ? "confirmed" : "failed";
    let changed = false;
    try {
      changed = await resolved.updateMovementStatus(movement.reference, next);
    } catch {
      changed = false;
    }
    if (next === "confirmed") confirmed += changed ? 1 : 0;
    else failed += changed ? 1 : 0;
  }

  const summary: ReconcileSummary = {
    reviewed: pendingBatch.length,
    confirmed,
    failed,
    pending: stillPending,
    skipped,
    durationMs: Date.now() - startedAt,
    truncated: pendingBatch.length >= RECONCILE_BATCH_LIMIT,
  };
  if (resolved.recordRun) {
    try {
      await resolved.recordRun(summary);
    } catch {
      // El resumen es monitoreo: nunca tumba la corrida por su falla.
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// 2. Feed unificado
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<WalletMovementStatus, number> = { pending: 0, failed: 1, confirmed: 2 };

/**
 * Deduplica el feed unificado: dos movimientos son el mismo si comparten
 * `reference` o `signature` (no nula). Al duplicar gana el estado más
 * avanzado (`confirmed` > `failed` > `pending`); el orden de salida es
 * `createdAt` descendente (más reciente primero), estable en empates.
 */
export function mergeUnifiedWalletActivity(movements: readonly UnifiedWalletMovement[]): UnifiedWalletMovement[] {
  // Índice llave (reference | signature) → posición en `entries`.
  const keyToEntry = new Map<string, number>();
  const entries: Array<{ chosen: UnifiedWalletMovement }> = [];

  for (const movement of movements) {
    const keys: string[] = [movement.reference];
    const signature = movement.signature?.trim();
    if (signature) keys.push(signature);
    const positions = [...new Set(keys)].map((key) => keyToEntry.get(key)).filter((p): p is number => p !== undefined);

    if (positions.length === 0) {
      entries.push({ chosen: movement });
      const index = entries.length - 1;
      for (const key of keys) keyToEntry.set(key, index);
      continue;
    }
    // Ya visto: fusiona en la primera entrada que lo tenía y registra las
    // llaves que faltaban (p. ej. una fuente trae la firma y otra no).
    const target = positions[0]!;
    const current = entries[target]!.chosen;
    if (STATUS_RANK[movement.status] > STATUS_RANK[current.status]) {
      entries[target]!.chosen = movement;
    }
    for (const key of keys) if (!keyToEntry.has(key)) keyToEntry.set(key, target);
  }

  return entries
    .map((entry) => entry.chosen)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
