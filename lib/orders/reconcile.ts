/**
 * M72: conciliación de órdenes reales con la cadena. Recorre las órdenes
 * abiertas (`pending`/`submitted`, `is_demo = false`) con antigüedad mínima
 * y las cierra según el estado on-chain:
 *
 * - `pending` sin firma y cotización vencida (por antigüedad o
 *   `quote_expires_at`) → `expired` con `error_code = 'QUOTE_EXPIRED'`.
 * - `submitted` con firma confirmada/finalizada sin error → `confirmed`
 *   con `confirmed_at`.
 * - `submitted` con firma que falló on-chain → `failed` con `error_code` y
 *   mensaje humano de `translateSolanaError` (M73).
 * - `submitted` con firma no encontrada y antigüedad sobre el límite →
 *   `expired` con `error_code = 'TX_EXPIRED'`.
 *
 * La decisión es PURA (`pendingQuoteExpired`/`decideSubmitted`); el acceso
 * a datos y al RPC vive en deps inyectables: `listOpenRealOrders` y
 * `updateOrderReconciled` (Supabase, `lib/services/orders.supabase.ts`) y
 * `getSignatureStatuses` (RPC de Solana con `@solana/web3.js` en lazy).
 * Sin deps y en `DATA_MODE=mock` no toca nada: devuelve ceros (los entornos
 * de demo y CI no concilian). La ruta `app/api/cron/reconcile-orders` la
 * llama con el default (producción, `DATA_MODE=live`).
 *
 * Idempotencia: la lectura sólo trae `pending`/`submitted`, y el update de
 * Supabase exige ese mismo estado (guard `in status`), así ninguna corrida
 * retrocede una orden `confirmed`/`failed` aunque dos crons choquen.
 */

import {
  listOpenRealOrders,
  updateOrderReconciled,
  type OrdersAdmin,
  type ReconcileOrderPatch,
  type ReconcileRow,
} from "@/lib/services/orders.supabase";
import { redactRpcSecrets, translateSolanaError } from "@/lib/solana/tx-errors";

/** Lectura normalizada de `getSignatureStatuses` (una por firma pedida). */
export interface SignatureStatusRead {
  /** `processed`/`confirmed`/`finalized`, o `null` si el RPC no la trae. */
  status: string | null;
  /** Error de ejecución on-chain; `null` = la tx corrió bien. */
  err: unknown;
}

export interface ReconcileDeps {
  /** Reloj inyectable (tests). Default: hora del sistema. */
  now?: () => Date;
  /**
   * Modo de datos inyectable. Default: `process.env.DATA_MODE` leído EN la
   * llamada (default `mock`), igual que `assertCronSecret` lee su secreto.
   */
  dataMode?: () => string;
  /** Cliente admin inyectable para los defaults (tests con fake Supabase). */
  admin?: OrdersAdmin;
  /** Lee las órdenes abiertas. Default: `listOpenRealOrders` (Supabase). */
  listOpen?: (opts: { cutoffIso: string; limit: number; admin?: OrdersAdmin }) => Promise<ReconcileRow[] | null>;
  /** Aplica el cambio. Default: `updateOrderReconciled` (Supabase). */
  update?: (id: string, patch: ReconcileOrderPatch, admin?: OrdersAdmin) => Promise<boolean>;
  /**
   * Estado on-chain de las firmas (índice = orden pedida; `null` = no
   * encontrada). Default: RPC de Solana vía `@solana/web3.js` en lazy.
   */
  getSignatureStatuses?: (signatures: string[]) => Promise<(SignatureStatusRead | null)[]>;
  /** Antigüedad mínima para revisar una orden. Default 60 s. */
  minAgeSeconds?: number;
  /** Default 15 min. */
  pendingExpireMinutes?: number;
  /** Default 15 min. */
  submittedExpireMinutes?: number;
  /** Tope de órdenes por corrida. Default 200 (un lote de `getSignatureStatuses`). */
  limit?: number;
  /** Log de avisos (RPC caído). Default: `console.warn` redactado. */
  log?: (message: string) => void;
}

export interface ReconcileSummary {
  ok: boolean;
  mode: "mock" | "live";
  scanned: number;
  confirmed: number;
  failed: number;
  expired: number;
  unchanged: number;
  durationMs: number;
}

export const RECONCILE_MIN_AGE_SECONDS = 60;
export const RECONCILE_PENDING_EXPIRE_MINUTES = 15;
export const RECONCILE_SUBMITTED_EXPIRE_MINUTES = 15;
export const RECONCILE_BATCH_LIMIT = 200;

/** `DATA_MODE` por llamada: los tests pueden stubearla sin reimportar. */
function effectiveDataMode(): string {
  const raw = (process.env.DATA_MODE ?? process.env.NEXT_PUBLIC_DATA_MODE ?? "mock").trim();
  return raw === "live" ? "live" : "mock";
}

/** ISO → epoch ms; `null` si no se puede parsear (no se decide sobre eso). */
function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * ¿Venció la cotización de una orden `pending` sin firma? Por antigüedad
 * (`created_at` sobre `expireMinutes`) o porque `quote_expires_at` ya pasó.
 * Puro: no toca red ni base.
 */
export function pendingQuoteExpired(row: ReconcileRow, nowMs: number, expireMinutes: number): boolean {
  const createdMs = parseMs(row.created_at);
  if (createdMs !== null && nowMs - createdMs > expireMinutes * 60_000) return true;
  const quoteMs = parseMs(row.quote_expires_at);
  return quoteMs !== null && quoteMs < nowMs;
}

/**
 * Decisión para una orden `submitted` con firma. Puro.
 *
 * - `onchain === undefined`: no se pudo consultar el RPC → sin decisión
 *   (queda abierta; la próxima corrida reintenta).
 * - `onchain === null`: firma no encontrada; sólo expira con antigüedad.
 * - `err` no nulo → `failed` con código y mensaje de `translateSolanaError`.
 * - `confirmed`/`finalized` sin error → `confirmed` con `confirmed_at`.
 * - `processed`/desconocido → sigue abierta.
 */
export function decideSubmitted(
  row: ReconcileRow,
  onchain: SignatureStatusRead | null | undefined,
  nowMs: number,
  expireMinutes: number,
): ReconcileOrderPatch | null {
  if (onchain === undefined) return null;
  if (onchain === null) {
    // Firma no encontrada: si la orden ya cumplió años, expiró; si no,
    // puede estar en camino → no tocar.
    const createdMs = parseMs(row.created_at);
    if (createdMs !== null && nowMs - createdMs > expireMinutes * 60_000) {
      return { status: "expired", error_code: "TX_EXPIRED" };
    }
    return null;
  }
  if (onchain.err !== null && onchain.err !== undefined) {
    const translated = translateSolanaError(onchain.err);
    return { status: "failed", error_code: translated.code, error: translated.userMessage };
  }
  if (onchain.status === "confirmed" || onchain.status === "finalized") {
    return { status: "confirmed", confirmed_at: new Date(nowMs).toISOString() };
  }
  return null;
}

/** RPC real: `@solana/web3.js` en lazy para no cargarlo al importar el módulo. */
async function defaultGetSignatureStatuses(signatures: string[]): Promise<(SignatureStatusRead | null)[]> {
  const { Connection } = await import("@solana/web3.js");
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const { value } = await connection.getSignatureStatuses(signatures, { searchTransactionHistory: true });
  return (value ?? []).map((entry) =>
    entry ? { status: entry.confirmationStatus ?? null, err: entry.err ?? null } : null,
  );
}

/**
 * Concilia las órdenes reales abiertas. Nunca lanza: una corrida que no
 * pudo leer la base se reporta `ok: false` con ceros.
 */
export async function reconcilePendingOrders(deps: ReconcileDeps = {}): Promise<ReconcileSummary> {
  const startedAt = Date.now();
  const dataMode = deps.dataMode ? deps.dataMode() : effectiveDataMode();
  const hasInjectedAccess =
    deps.listOpen !== undefined || deps.update !== undefined || deps.getSignatureStatuses !== undefined;
  // Sin acceso inyectado en mock no hay nada real que conciliar (demo/CI).
  if (dataMode !== "live" && !hasInjectedAccess) {
    return {
      ok: true,
      mode: "mock",
      scanned: 0,
      confirmed: 0,
      failed: 0,
      expired: 0,
      unchanged: 0,
      durationMs: 0,
    };
  }

  const mode: "mock" | "live" = dataMode === "live" ? "live" : "mock";
  const nowMs = (deps.now ? deps.now() : new Date()).getTime();
  const minAgeSeconds = deps.minAgeSeconds ?? RECONCILE_MIN_AGE_SECONDS;
  const pendingExpireMinutes = deps.pendingExpireMinutes ?? RECONCILE_PENDING_EXPIRE_MINUTES;
  const submittedExpireMinutes = deps.submittedExpireMinutes ?? RECONCILE_SUBMITTED_EXPIRE_MINUTES;
  const listOpen = deps.listOpen ?? ((opts: { cutoffIso: string; limit: number }) => listOpenRealOrders({ ...opts, admin: deps.admin }));
  const update = deps.update ?? ((id: string, patch: ReconcileOrderPatch) => updateOrderReconciled(id, patch, deps.admin));
  const getSignatureStatuses = deps.getSignatureStatuses ?? defaultGetSignatureStatuses;
  const log = deps.log ?? ((message: string) => console.warn(message));

  const cutoffIso = new Date(nowMs - minAgeSeconds * 1000).toISOString();
  let rows: ReconcileRow[] | null = null;
  try {
    rows = await listOpen({ cutoffIso, limit: deps.limit ?? RECONCILE_BATCH_LIMIT });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[reconcile-orders] no se pudo leer la tabla de órdenes: ${redactRpcSecrets(message)}`);
    rows = null;
  }
  const finish = (counts: { confirmed: number; failed: number; expired: number; unchanged: number }, ok: boolean): ReconcileSummary => ({
    ok,
    mode,
    scanned: rows?.length ?? 0,
    ...counts,
    durationMs: Date.now() - startedAt,
  });
  if (rows === null) return finish({ confirmed: 0, failed: 0, expired: 0, unchanged: 0 }, false);

  // Un solo lote on-chain con las firmas de las `submitted`.
  const statuses = new Map<string, SignatureStatusRead | null | undefined>();
  const submittedRows = rows.filter((row) => row.status === "submitted" && row.tx_signature);
  if (submittedRows.length > 0) {
    const unique = [...new Set(submittedRows.map((row) => row.tx_signature).filter((sig): sig is string => Boolean(sig)))];
    try {
      const reads = await getSignatureStatuses(unique);
      unique.forEach((signature, index) => {
        statuses.set(signature, index < reads.length ? reads[index] : undefined);
      });
    } catch (error) {
      // RPC caído: nada de `submitted` se decide en esta corrida (quedan
      // abiertas); se reintenta en el siguiente tick del cron.
      const message = error instanceof Error ? error.message : String(error);
      log(`[reconcile-orders] RPC de Solana no respondió: ${redactRpcSecrets(message)}`);
    }
  }

  let confirmed = 0;
  let failed = 0;
  let expired = 0;
  let unchanged = 0;
  for (const row of rows) {
    let patch: ReconcileOrderPatch | null = null;
    if (row.status === "pending" && !row.tx_signature) {
      patch = pendingQuoteExpired(row, nowMs, pendingExpireMinutes)
        ? { status: "expired", error_code: "QUOTE_EXPIRED" }
        : null;
    } else if (row.status === "submitted" && row.tx_signature) {
      patch = decideSubmitted(row, statuses.get(row.tx_signature), nowMs, submittedExpireMinutes);
    }
    // `confirmed`/`failed`/`expired` no llegan por la lectura y una fila
    // ajena al spec no se toca: la idempotencia es doble (SELECT + guard).
    if (patch && (await update(row.id, patch))) {
      if (patch.status === "confirmed") confirmed += 1;
      else if (patch.status === "failed") failed += 1;
      else expired += 1;
    } else {
      unchanged += 1;
    }
  }
  return finish({ confirmed, failed, expired, unchanged }, true);
}
