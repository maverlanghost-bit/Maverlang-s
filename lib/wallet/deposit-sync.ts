import "server-only";

import { isValidSolanaAddress } from "@/lib/solana/address";
import type { SignatureStatusLike } from "@/lib/solana/signature-status";
import { redactRpcSecrets } from "@/lib/solana/tx-errors";
import {
  USDC_MINT_SOLANA,
  indexSolanaUsdcDeposits,
  type IndexedUsdcDeposit,
  type UsdcDepositCandidate,
} from "@/lib/wallet/deposit-indexer";
import { netTokenDeltasByMint } from "@/lib/wallet/token-deltas";

/**
 * Seguimiento de depósitos USDC en Solana (M78) conectado al cron de
 * billetera. Reutiliza el indexador existente (`indexSolanaUsdcDeposits`) y
 * le entrega candidatas ya parseadas desde el RPC:
 *
 * - Identidad: las billeteras salen SIEMPRE de `public.wallets` (verificadas
 *   por M66). El `userId` de cada depósito es el de esa fila; jamás se toma
 *   de la cadena ni de un request. Una firma ya registrada a nombre de otro
 *   usuario no se reasigna: se rechaza (`foreign`).
 * - Estados honestos: la cadena sólo puede decir `processed` (detectado),
 *   `confirmed` o `finalized`. Se persiste `detected` como
 *   `wallet_movements.pending` (sin entrar al libro `crypto_deposits`, que
 *   todavía podría revertirse) y `confirmed`/`finalized` como `confirmed`:
 *   la tabla (0030) no tiene un valor `finalized` y no se inventa uno. El
 *   conteo de `finalized` se reporta aparte para observabilidad.
 * - Idempotencia: la firma es única en `crypto_deposits` y en
 *   `wallet_movements.reference`; los upserts usan `ignoreDuplicates` y
 *   devuelven si insertaron de verdad. Repetir una corrida no duplica.
 * - Procesamiento limitado: lote de billeteras por corrida (con rotación
 *   diaria), firmas por billetera, tope global de firmas y presupuesto de
 *   tiempo. Lo que queda fuera se reporta con `truncated: true`.
 * - Errores explícitos: si no se puede leer `wallets`/`crypto_deposits`, la
 *   corrida devuelve `ok: false` (nunca "cero depósitos" silencioso). Los
 *   errores por billetera se listan redactados.
 * - Sin fondos reales: sólo LEE la cadena y escribe el registro de depósitos.
 *   No firma, no transfiere y no habilita trading ni retiros.
 *
 * `DATA_MODE` distinto de `live` no toca red ni base (demo/CI). En live el
 * barrido está APAGADO por defecto: staging lo enciende explícitamente con
 * `WALLET_DEPOSIT_SYNC=on`. La conciliación de pendientes del cron sigue
 * funcionando con el barrido apagado.
 */

/** Máximo de billeteras por corrida (el resto rota en corridas siguientes). */
export const DEPOSIT_SCAN_MAX_WALLETS = 50;
/** Firmas recientes revisadas por billetera. */
export const DEPOSIT_SCAN_SIGNATURES_PER_WALLET = 20;
/** Firmas ya registradas que se precargan por usuario (cota de lectura). */
export const DEPOSIT_SCAN_KNOWN_SIGNATURES = 500;
/** Tope global de firmas por corrida (presupuesto de RPC). */
export const DEPOSIT_SCAN_MAX_SIGNATURES = 400;
/** Presupuesto de tiempo por corrida (Vercel corta a los 60 s). */
export const DEPOSIT_SCAN_MAX_DURATION_MS = 40_000;
/** Ventana de rotación del lote de billeteras. */
const ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DepositLifecycleStatus = "detected" | "confirmed" | "finalized";

/**
 * Sólo un depósito con confirmación on-chain suficiente entra al libro
 * `crypto_deposits` (que es el registro durable del dinero recibido).
 * `detected` (processed o sin estado) todavía puede revertirse: se muestra
 * como movimiento `pending`, pero no se asienta como depósito confirmado.
 */
export function isDepositLedgerEligible(lifecycle: DepositLifecycleStatus): boolean {
  return lifecycle === "confirmed" || lifecycle === "finalized";
}

export interface DepositScanWallet {
  userId: string;
  address: string;
}

/** Balance de token tal como lo devuelve una transacción parseada. */
export interface ParsedTokenBalanceLike {
  accountIndex: number;
  mint: string;
  owner?: string | null;
  uiTokenAmount: {
    uiAmount?: number | null;
    amount?: string | null;
    decimals?: number | null;
  };
}

/** Forma mínima de `ParsedTransactionWithMeta` que consume el parser puro. */
export interface ParsedTxLike {
  meta: {
    err: unknown;
    preTokenBalances?: ParsedTokenBalanceLike[] | null;
    postTokenBalances?: ParsedTokenBalanceLike[] | null;
  } | null;
  transaction?: { signatures?: readonly string[] | null } | null;
  blockTime?: number | null;
}

/** Candidata de depósito con el estado real que reportó la cadena. */
export interface ScannedDeposit extends UsdcDepositCandidate {
  lifecycle: DepositLifecycleStatus;
  /** `blockTime` de la cadena en ms; `null` si el RPC no lo trae. */
  blockTimeMs: number | null;
}

export type RecordDepositOutcome = "recorded" | "duplicate" | "foreign" | "error";

export interface RecordDepositInput extends IndexedUsdcDeposit {
  lifecycle: DepositLifecycleStatus;
  blockTimeMs: number | null;
}

export interface DepositSyncDeps {
  /** Override de `DATA_MODE` (tests). */
  dataMode?: () => string;
  /** Reloj inyectable (tests). */
  now?: () => Date;
  /** Total de billeteras verificadas. `null` = no se pudo leer. */
  countWallets: () => Promise<number | null>;
  /** Página de billeteras verificadas. `null` = no se pudo leer. */
  listWallets: (opts: { limit: number; offset: number }) => Promise<DepositScanWallet[] | null>;
  /** Firmas recientes de la dirección (más nuevas primero). Lanza si el RPC falla. */
  listSignatures: (address: string, limit: number) => Promise<readonly string[]>;
  /** Transacciones parseadas + estado de firma (mismo orden que `signatures`). */
  readTransactions: (signatures: string[]) => Promise<{
    transactions: ReadonlyArray<ParsedTxLike | null>;
    statuses: ReadonlyArray<SignatureStatusLike | null>;
  }>;
  /** Firmas ya registradas del usuario. `null` = no se pudo leer (fail closed). */
  listKnownSignatures: (userId: string, limit: number) => Promise<Iterable<string> | null>;
  /** Registra el depósito y su actividad. Lanza si no pudo escribir. */
  recordDeposit: (input: RecordDepositInput) => Promise<RecordDepositOutcome>;
  /** Log de avisos (redactado). Default: `console.warn`. */
  log?: (message: string) => void;
}

export interface DepositSyncSummary {
  /** `false` = no se pudo cubrir el alcance (identidad o alguna billetera). */
  ok: boolean;
  mode: "mock" | "live";
  /** `false` = barrido apagado (mock o `WALLET_DEPOSIT_SYNC` sin encender). */
  enabled: boolean;
  /** Total de billeteras Solana verificadas (universo del barrido). */
  walletsTotal: number;
  walletsScanned: number;
  failedWallets: number;
  signaturesChecked: number;
  /** Actividad nueva registrada, por estado real de la cadena. */
  detected: number;
  confirmed: number;
  finalized: number;
  duplicates: number;
  rejected: number;
  skipped: number;
  /** Errores redactados (máx. 5) de esta corrida. */
  errors: string[];
  truncated: boolean;
  durationMs: number;
}

/** `DATA_MODE` por llamada, igual que `reconcilePendingOrders`. */
function effectiveDataMode(): string {
  const raw = (process.env.DATA_MODE ?? process.env.NEXT_PUBLIC_DATA_MODE ?? "mock").trim();
  return raw === "live" ? "live" : "mock";
}

/**
 * Interruptor de staging: el barrido sólo se enciende con
 * `WALLET_DEPOSIT_SYNC=on|1|true|enabled`. Cualquier otro valor (incluido
 * ausente) deja el cron en conciliación de pendientes sin leer la cadena
 * para depósitos nuevos. No toca credenciales ni habilita fondos.
 */
function depositSyncEnabled(): boolean {
  const raw = (process.env.WALLET_DEPOSIT_SYNC ?? "").trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true" || raw === "enabled";
}

/**
 * Estado de ciclo de vida a partir de `getSignatureStatuses`. Puro.
 * - sin estado o `processed`: `detected` (puede revertirse; no se asienta).
 * - `confirmed`: `confirmed`.
 * - `finalized`: `finalized`.
 * - `err` no nulo: la transacción falló; el indexador la rechaza igual.
 */
export function depositLifecycleFromStatus(
  status: SignatureStatusLike | null | undefined,
): DepositLifecycleStatus {
  if (!status) return "detected";
  if (status.err !== null && status.err !== undefined) return "detected";
  if (status.confirmationStatus === "finalized") return "finalized";
  if (status.confirmationStatus === "confirmed") return "confirmed";
  return "detected";
}

/**
 * Estado de `wallet_movements` para un ciclo de vida. La tabla sólo admite
 * `pending|confirmed|failed`: `finalized` se guarda como `confirmed`
 * (terminal para el usuario) y se cuenta aparte en el resumen.
 */
export function walletMovementStatusForLifecycle(
  lifecycle: DepositLifecycleStatus,
): "pending" | "confirmed" {
  return lifecycle === "detected" ? "pending" : "confirmed";
}

/** Redondeo a micro-USDC para que sumas de deltas den un monto estable. */
function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Extrae depósitos USDC de transacciones parseadas. Puro: no toca red ni
 * base. Sólo cuenta el delta NETO del mint USDC para la billetera escaneada
 * (aislamiento por usuario): sumar sólo las cuentas que suben permitiría
 * "depositar" moviendo USDC entre dos cuentas propias del mismo mint.
 *
 * Además, la firma que reporta la transacción tiene que ser la que se pidió
 * al RPC: una respuesta desordenada o adulterada no se usa para acreditar.
 */
export function extractUsdcDepositsFromTransactions(params: {
  walletAddress: string;
  signatures: readonly string[];
  transactions: ReadonlyArray<ParsedTxLike | null>;
  statuses: ReadonlyArray<SignatureStatusLike | null>;
}): ScannedDeposit[] {
  const wallet = params.walletAddress.trim();
  const found: ScannedDeposit[] = [];

  for (let i = 0; i < params.signatures.length; i += 1) {
    const requested = (params.signatures[i] ?? "").trim();
    const tx = params.transactions[i] ?? null;
    if (!tx || !tx.meta) continue;
    const signature = (tx.transaction?.signatures?.[0] ?? "").trim();
    if (!signature) continue;
    // El RPC debe devolver la misma transacción que se pidió. Si no calza,
    // no se usa: evita acreditar con datos de otra firma.
    if (requested !== "" && signature !== requested) continue;

    const status = params.statuses[i] ?? null;
    const lifecycle = depositLifecycleFromStatus(status);
    const err = status?.err ?? tx.meta.err ?? null;
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];

    // Neto por mint: las bajadas de otras cuentas propias compensan las subidas.
    const deltas = netTokenDeltasByMint({ owner: wallet, pre, post });
    const amount = deltas.get(USDC_MINT_SOLANA) ?? 0;
    if (!(amount > 0)) continue;
    const amountUi = roundUsdc(amount);
    if (!(amountUi > 0)) continue;

    const blockTimeMs =
      typeof tx.blockTime === "number" && Number.isFinite(tx.blockTime) && tx.blockTime > 0
        ? tx.blockTime * 1000
        : null;

    found.push({
      signature,
      mint: USDC_MINT_SOLANA,
      destination: wallet,
      amountUi,
      err,
      from: null,
      lifecycle,
      blockTimeMs,
    });
  }

  return found;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/** Dependencias de producción: Supabase (service role) + RPC de Solana. */
async function liveDeps(): Promise<DepositSyncDeps> {
  const [depositService, movementService, connectionModule, web3] = await Promise.all([
    import("@/lib/services/deposits.supabase"),
    import("@/lib/services/wallet-movements.supabase"),
    import("@/lib/solana/connection"),
    import("@solana/web3.js"),
  ]);
  const { getServerConnection } = connectionModule;
  const { PublicKey } = web3;

  return {
    countWallets: () => depositService.countDepositScanWallets(),
    listWallets: (opts) => depositService.listWalletsForDepositScan(opts.limit, opts.offset),
    listKnownSignatures: (userId, limit) => depositService.listDepositSignaturesForScan(userId, limit),
    listSignatures: async (address, limit) => {
      const rows = await getServerConnection().getSignaturesForAddress(new PublicKey(address), { limit });
      return rows.map((row) => row.signature).filter((signature) => signature.trim() !== "");
    },
    readTransactions: async (signatures) => {
      const connection = getServerConnection();
      const [transactions, statuses] = await Promise.all([
        connection.getParsedTransactions(signatures, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        }),
        connection.getSignatureStatuses(signatures, { searchTransactionHistory: true }),
      ]);
      return {
        transactions: transactions as unknown as ReadonlyArray<ParsedTxLike | null>,
        statuses: statuses.value as unknown as ReadonlyArray<SignatureStatusLike | null>,
      };
    },
    recordDeposit: async (input) => {
      // `processed`/sin estado puede revertirse: sólo deja actividad pendiente.
      // El libro durable `crypto_deposits` se escribe cuando la cadena confirma.
      let inserted = false;
      if (isDepositLedgerEligible(input.lifecycle)) {
        try {
          inserted = await depositService.insertCryptoDeposit({
            userId: input.userId,
            mint: input.mint,
            amountUi: input.amountUi,
            signature: input.signature,
            fromAddress: input.fromAddress,
          });
        } catch {
          return "error";
        }
      }
      if (!inserted) {
        // La firma puede existir: sólo se repara la actividad si es del mismo
        // usuario. Una firma registrada a nombre de otro nunca se reasigna.
        const owner = await depositService.findCryptoDepositOwner(input.signature);
        if (!owner.ok) return "error";
        if (owner.userId !== null && owner.userId !== input.userId) return "foreign";
      }
      let movementInserted = false;
      try {
        movementInserted = await movementService.upsertWalletMovement({
          userId: input.userId,
          kind: "deposit",
          mint: input.mint,
          amountUi: input.amountUi,
          reference: input.signature,
          status: walletMovementStatusForLifecycle(input.lifecycle),
          signature: input.signature,
          counterpartyAddress: input.fromAddress,
          createdAt: input.blockTimeMs !== null ? new Date(input.blockTimeMs).toISOString() : null,
        });
      } catch {
        return "error";
      }
      if (!inserted && !movementInserted) return "duplicate";
      return "recorded";
    },
  };
}

function baseSummary(
  mode: "mock" | "live",
  startedAt: number,
  enabled = false,
): DepositSyncSummary {
  return {
    ok: true,
    mode,
    enabled,
    walletsTotal: 0,
    walletsScanned: 0,
    failedWallets: 0,
    signaturesChecked: 0,
    detected: 0,
    confirmed: 0,
    finalized: 0,
    duplicates: 0,
    rejected: 0,
    skipped: 0,
    errors: [],
    truncated: false,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Barrido de depósitos USDC del cron. Nunca lanza: cualquier falla se
 * reporta con `ok: false` y el detalle redactado en `errors`.
 */
export async function syncSolanaUsdcDeposits(injected?: DepositSyncDeps): Promise<DepositSyncSummary> {
  const startedAt = Date.now();
  const dataMode = injected?.dataMode ? injected.dataMode() : effectiveDataMode();
  const mode: "mock" | "live" = dataMode === "live" ? "live" : "mock";

  // Demo/CI sin deps inyectadas: no se toca la cadena ni la base.
  if (mode !== "live" && !injected) return baseSummary("mock", startedAt);
  // Live sin el interruptor explícito: sólo se concilian pendientes.
  if (mode === "live" && !injected && !depositSyncEnabled()) return baseSummary("live", startedAt);

  let deps: DepositSyncDeps;
  try {
    deps = injected ?? (await liveDeps());
  } catch (error) {
    const failed = baseSummary(mode, startedAt, true);
    failed.ok = false;
    failed.errors.push(redactRpcSecrets(messageOf(error)).slice(0, 240));
    console.warn("[reconcile-wallet] depósitos: dependencias no disponibles (fail closed).");
    return failed;
  }
  const summary = baseSummary(mode, startedAt, true);
  const log = deps.log ?? ((message: string) => console.warn(message));
  const noteError = (message: string) => {
    const clean = redactRpcSecrets(message).slice(0, 240);
    log(`[reconcile-wallet] depósitos: ${clean}`);
    if (summary.errors.length >= 5) return;
    summary.errors.push(clean);
  };

  // 1) Identidad: total de billeteras verificadas. Sin esto, no hay barrido.
  let total: number | null = null;
  try {
    total = await deps.countWallets();
  } catch (error) {
    total = null;
    noteError(`no se pudo contar billeteras: ${messageOf(error)}`);
  }
  if (total === null) {
    summary.ok = false;
    log("[reconcile-wallet] depósitos: no se pudo leer la tabla de billeteras (fail closed).");
    summary.durationMs = Date.now() - startedAt;
    return summary;
  }
  summary.walletsTotal = total;
  if (total === 0) {
    summary.durationMs = Date.now() - startedAt;
    return summary;
  }

  // Rotación diaria del lote para no barrer siempre a los mismos usuarios.
  const nowMs = (deps.now ? deps.now() : new Date()).getTime();
  const bucket = Math.floor(nowMs / ROTATION_WINDOW_MS);
  const offset = total > DEPOSIT_SCAN_MAX_WALLETS ? (bucket * DEPOSIT_SCAN_MAX_WALLETS) % total : 0;

  let wallets: DepositScanWallet[] | null = null;
  try {
    wallets = await deps.listWallets({ limit: DEPOSIT_SCAN_MAX_WALLETS, offset });
  } catch (error) {
    wallets = null;
    noteError(`no se pudo listar billeteras: ${messageOf(error)}`);
  }
  if (wallets === null) {
    summary.ok = false;
    log("[reconcile-wallet] depósitos: no se pudo listar billeteras (fail closed).");
    summary.durationMs = Date.now() - startedAt;
    return summary;
  }
  for (const wallet of wallets) {
    if (Date.now() - startedAt > DEPOSIT_SCAN_MAX_DURATION_MS) {
      summary.truncated = true;
      break;
    }
    if (summary.signaturesChecked >= DEPOSIT_SCAN_MAX_SIGNATURES) {
      summary.truncated = true;
      break;
    }
    const userId = typeof wallet.userId === "string" ? wallet.userId.trim() : "";
    const address = typeof wallet.address === "string" ? wallet.address.trim() : "";
    if (!userId || !isValidSolanaAddress(address)) {
      summary.skipped += 1;
      noteError(`billetera inválida omitida (${shortAddress(address || "—")}).`);
      continue;
    }

    try {
      const signatures = await deps.listSignatures(address, DEPOSIT_SCAN_SIGNATURES_PER_WALLET);
      const unique = [...new Set(signatures.map((s) => s.trim()).filter((s) => s !== ""))];
      const remaining = DEPOSIT_SCAN_MAX_SIGNATURES - summary.signaturesChecked;
      const batch = unique.slice(0, Math.min(DEPOSIT_SCAN_SIGNATURES_PER_WALLET, remaining));
      if (batch.length === 0) {
        summary.walletsScanned += 1;
        continue;
      }
      summary.signaturesChecked += batch.length;
      summary.walletsScanned += 1;

      const { transactions, statuses } = await deps.readTransactions(batch);
      const candidates = extractUsdcDepositsFromTransactions({
        walletAddress: address,
        signatures: batch,
        transactions,
        statuses,
      });
      if (candidates.length === 0) continue;

      const known = await deps.listKnownSignatures(userId, DEPOSIT_SCAN_KNOWN_SIGNATURES);
      if (known === null) {
        // Sin las firmas ya registradas no se puede garantizar idempotencia
        // ni propiedad: se omite esta billetera y se reporta.
        summary.failedWallets += 1;
        noteError(`no se pudieron leer las firmas registradas de ${shortAddress(address)}.`);
        continue;
      }
      const bySignature = new Map(candidates.map((candidate) => [candidate.signature, candidate]));
      const insertFailed = new Set<string>();
      const foreign = new Set<string>();

      const result = await indexSolanaUsdcDeposits({
        userId,
        walletAddress: address,
        candidates,
        knownSignatures: known,
        deps: {
          listKnownSignatures: async () => known,
          insertDeposit: async (deposit: IndexedUsdcDeposit) => {
            const candidate = bySignature.get(deposit.signature);
            let outcome: RecordDepositOutcome;
            try {
              outcome = await deps.recordDeposit({
                ...deposit,
                lifecycle: candidate?.lifecycle ?? "detected",
                blockTimeMs: candidate?.blockTimeMs ?? null,
              });
            } catch (error) {
              noteError(`no se pudo registrar ${deposit.signature.slice(0, 8)}…: ${messageOf(error)}`);
              insertFailed.add(deposit.signature);
              return false;
            }
            if (outcome === "error") {
              noteError(`no se pudo registrar ${deposit.signature.slice(0, 8)}… en la actividad.`);
              insertFailed.add(deposit.signature);
              return false;
            }
            if (outcome === "foreign") {
              foreign.add(deposit.signature);
              return false;
            }
            if (outcome === "duplicate") return false;
            if (candidate?.lifecycle === "finalized") summary.finalized += 1;
            else if (candidate?.lifecycle === "confirmed") summary.confirmed += 1;
            else summary.detected += 1;
            return true;
          },
        },
      });

      summary.rejected += result.rejected.length;
      summary.duplicates += result.duplicates.filter(
        (signature) => !insertFailed.has(signature) && !foreign.has(signature),
      ).length;
      if (foreign.size > 0) {
        noteError(
          `${foreign.size} firma(s) ya registradas a nombre de otro usuario: no se reasignaron.`,
        );
      }
    } catch (error) {
      summary.failedWallets += 1;
      noteError(`billetera ${shortAddress(address)}: ${messageOf(error)}`);
    }
  }

  if (summary.failedWallets > 0) summary.ok = false;
  summary.durationMs = Date.now() - startedAt;
  if (!summary.ok) {
    log("[reconcile-wallet] depósitos: corrida incompleta; revisar `errors`.");
  }
  return summary;
}
