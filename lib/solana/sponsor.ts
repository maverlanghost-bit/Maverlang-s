import "server-only";

import { serverEnv } from "@/lib/env";
import { addressesEqual, isValidSolanaAddress } from "@/lib/solana/address";

import {
  HARD_MAX_ACCOUNTS,
  HARD_MAX_COMPUTE_UNITS,
  HARD_MAX_SPONSOR_FEE_LAMPORTS,
  HARD_MAX_TRANSACTION_BYTES,
  DEFAULT_SPONSOR_PROGRAMS,
  SponsorError,
  type SponsorReservation,
  type SponsorSignOutput,
  type SponsorUsageDecision,
  type SponsorUsageStore,
  type SponsorshipConfig,
  type SponsorshipDeps,
  type SponsorshipRequest,
  type SponsorshipResult,
} from "./sponsorship/contracts";
import {
  assertSponsorDescriptor,
  assertSponsorSelection,
  assertSponsorshipConfig,
  findSponsor,
} from "./sponsorship/policy";
import { validateSponsorTransaction, verifySponsorSignature } from "./sponsorship/transaction";

export * from "./sponsorship/contracts";
export * from "./sponsorship/kms";
export * from "./sponsorship/policy";
export * from "./sponsorship/transaction";

/**
 * Patrocinio de la comisión de red (fee-payer). [DISEÑO, SIN HABILITAR]
 *
 * Estado actual:
 * - `SPONSOR_ENABLED=false` por defecto (lib/env.ts). No se cambia aquí.
 * - `loadSponsorshipConfigFromEnv()` devuelve `sponsors: []` y
 *   `KMS_REQUIRED_SPONSOR`: con el flag encendido, igual falla con
 *   `SPONSOR_NOT_CONFIGURED` / `SPONSOR_KEY_MISMATCH`.
 * - `sponsorTransaction()` sigue siendo un stub que lanza y nunca firma.
 * - No hay clave privada en env, código, tipos ni logs. Sólo direcciones
 *   públicas y contratos.
 * - Requiere runtime Node.js (`node:crypto`); no usar en Edge.
 *
 * Flujo previsto (no conectado a rutas todavía):
 * 1. La UI deja al usuario elegir `self` o `sponsor:<empresa>`.
 * 2. El servidor guarda `expectedRecentBlockhash` y el SHA-256 del mensaje
 *    al construir la transacción; el cliente no los elige. Esa transacción
 *    debe tener ya al sponsor como fee-payer (recompilar el mensaje o usar
 *    el soporte de fee-payer del proveedor); `readSponsorTransactionBinding`
 *    ayuda a guardar ambos datos.
 * 3. `authorizeAndSponsor()` valida config, consentimiento, cuotas,
 *    transacción, fee-payer y allowlist de programas.
 * 4. Recién entonces pide la firma a un `SponsorKms` (KMS/HSM) y verifica
 *    que sólo se agregó la firma del sponsor.
 * 5. El cliente firma con su wallet y envía. El sponsor no firma nada que
 *    no esté en la allowlist ni que incluya su cuenta en una instrucción.
 *
 * Pendiente para habilitar (fuera de este cambio):
 * - Registrar cada empresa con su PUBLIC KEY y sus límites aprobados.
 * - Implementar `SponsorUsageStore` durable y atómico (Redis/Postgres).
 * - Conectar un KMS/HSM y un `SponsorKms` real (sin claves en env).
 * - Revisar y ampliar la allowlist de programas (router v2/RFQ de Jupiter).
 * - Decidir si el sponsor también paga renta de ATA; hoy el contrato sólo
 *   autoriza la comisión y rechaza al sponsor en cualquier instrucción.
 * - Conectar quote/build/sponsor/submit en una tarea posterior.
 */

/** Sólo lee el flag. No enciende nada ni crea sponsors. */
export function isSponsorshipEnabled(): boolean {
  return serverEnv.SPONSOR_ENABLED === true;
}

/**
 * Configuración segura desde env: el flag puede venir true, pero la lista de
 * empresas queda vacía a propósito. Sin un registro explícito en código (o
 * en un store aprobado), no se patrocina.
 */
export function loadSponsorshipConfigFromEnv(): SponsorshipConfig {
  return {
    enabled: serverEnv.SPONSOR_ENABLED === true,
    cluster: serverEnv.NEXT_PUBLIC_SOLANA_CLUSTER,
    sponsors: [],
    maxFeeLamports: HARD_MAX_SPONSOR_FEE_LAMPORTS,
    maxTransactionBytes: HARD_MAX_TRANSACTION_BYTES,
    maxSignatures: 2,
    maxInstructions: 32,
    maxAccounts: HARD_MAX_ACCOUNTS,
    maxComputeUnits: HARD_MAX_COMPUTE_UNITS,
    allowedPrograms: DEFAULT_SPONSOR_PROGRAMS,
  };
}

/**
 * Stub legado. Se mantiene la firma `never` para que cualquier llamada
 * existente siga fallando de forma explícita. No firma, no lee claves y no
 * toca la red.
 */
export function sponsorTransaction(transactionBase64: string): never {
  void transactionBase64;
  throw new SponsorError(
    "SPONSOR_DISABLED",
    "NOT_IMPLEMENTED: el patrocinio de comisiones de red sigue apagado y no hay KMS configurado. No se firmó nada.",
  );
}

async function releaseReservation(
  usage: SponsorUsageStore,
  reservation: SponsorReservation,
): Promise<void> {
  if (typeof usage.release !== "function") return;
  try {
    await usage.release(reservation);
  } catch {
    // Best effort: si falla el release, la cuota queda consumida. Es el lado
    // seguro (no se libera de más) y no se registra contenido sensible.
  }
}

/**
 * Orquesta el patrocinio. Fail-closed en cada paso: cualquier dato faltante,
 * límite excedido, transacción inesperada o firmante no configurado lanza
 * `SponsorError` antes de producir una firma.
 */
export async function authorizeAndSponsor(
  request: SponsorshipRequest,
  deps: SponsorshipDeps,
): Promise<SponsorshipResult> {
  if (!deps || !deps.config) {
    throw new SponsorError("SPONSOR_NOT_CONFIGURED");
  }

  const requestId = typeof request?.requestId === "string" ? request.requestId.trim() : "";
  if (!request || !requestId || requestId.length > 200) {
    throw new SponsorError("SPONSOR_REQUEST_INVALID");
  }
  if (typeof request.sponsorId !== "string" || request.sponsorId.trim().length === 0) {
    throw new SponsorError("SPONSOR_REQUEST_INVALID");
  }
  const expectedMessageSha256 =
    typeof request.expectedMessageSha256 === "string"
      ? request.expectedMessageSha256.trim().toLowerCase()
      : "";
  if (!/^[0-9a-f]{64}$/.test(expectedMessageSha256)) {
    throw new SponsorError("SPONSOR_REQUEST_INVALID");
  }

  let now: number;
  try {
    now = deps.now ? deps.now() : Date.now();
  } catch {
    throw new SponsorError("SPONSOR_LIMITER_UNAVAILABLE");
  }
  if (!Number.isFinite(now) || now <= 0) {
    throw new SponsorError("SPONSOR_LIMITER_UNAVAILABLE");
  }

  assertSponsorshipConfig(deps.config);
  const sponsor = findSponsor(deps.config, request.sponsorId);
  if (!sponsor) {
    throw new SponsorError("SPONSOR_UNKNOWN");
  }
  assertSponsorDescriptor(sponsor, deps.config);
  assertSponsorSelection({
    sponsor,
    userId: request.userId,
    walletAddress: request.walletAddress,
    consent: request.consent,
    now,
  });

  if (
    !deps.signer ||
    typeof deps.signer.signFeePayer !== "function" ||
    typeof deps.signer.feePayer !== "string" ||
    !isValidSolanaAddress(deps.signer.feePayer) ||
    !addressesEqual(deps.signer.feePayer, sponsor.feePayer)
  ) {
    throw new SponsorError(
      deps.signer ? "SPONSOR_KEY_MISMATCH" : "SPONSOR_SIGNER_UNAVAILABLE",
    );
  }

  if (!deps.usage || typeof deps.usage.reserve !== "function") {
    throw new SponsorError("SPONSOR_LIMITER_UNAVAILABLE");
  }

  const validated = validateSponsorTransaction(request.transactionBase64, {
    sponsorFeePayer: sponsor.feePayer,
    userWallet: request.walletAddress,
    expectedRecentBlockhash: request.expectedRecentBlockhash,
    expectedMessageSha256,
    maxFeeLamports: Math.min(
      sponsor.maxFeeLamports,
      deps.config.maxFeeLamports,
      HARD_MAX_SPONSOR_FEE_LAMPORTS,
    ),
    maxTransactionBytes: deps.config.maxTransactionBytes,
    maxSignatures: deps.config.maxSignatures,
    maxInstructions: deps.config.maxInstructions,
    maxAccounts: deps.config.maxAccounts,
    maxComputeUnits: deps.config.maxComputeUnits,
    allowedPrograms: deps.config.allowedPrograms,
  });

  const reservation: SponsorReservation = {
    requestId,
    sponsorId: sponsor.id,
    userId: request.userId.trim(),
    feeLamports: validated.fee.totalFeeLamports,
    now,
    messageSha256: validated.messageSha256,
    limits: sponsor.limits,
  };

  let decision: SponsorUsageDecision;
  try {
    decision = await deps.usage.reserve(reservation);
  } catch {
    throw new SponsorError("SPONSOR_LIMITER_UNAVAILABLE");
  }
  if (!decision || decision.allowed !== true) {
    throw new SponsorError(decision?.code ?? "SPONSOR_LIMIT_EXCEEDED");
  }

  let signed: SponsorSignOutput;
  try {
    signed = await deps.signer.signFeePayer({
      transactionBase64: validated.transactionBase64,
      sponsorFeePayer: sponsor.feePayer,
      messageSha256: validated.messageSha256,
    });
  } catch (error) {
    await releaseReservation(deps.usage, reservation);
    if (error instanceof SponsorError) throw error;
    throw new SponsorError("SPONSOR_SIGNER_UNAVAILABLE");
  }

  if (!signed || typeof signed.signedTransactionBase64 !== "string" || !signed.signedTransactionBase64.trim()) {
    await releaseReservation(deps.usage, reservation);
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  try {
    verifySponsorSignature(signed.signedTransactionBase64, validated);
  } catch (error) {
    await releaseReservation(deps.usage, reservation);
    if (error instanceof SponsorError) throw error;
    throw new SponsorError("SPONSOR_SIGNATURE_INVALID");
  }

  return {
    requestId,
    sponsorId: sponsor.id,
    feePayer: sponsor.feePayer,
    signedTransactionBase64: signed.signedTransactionBase64,
    messageSha256: validated.messageSha256,
    fee: validated.fee,
  };
}
