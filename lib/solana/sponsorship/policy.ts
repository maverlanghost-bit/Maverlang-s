import "server-only";

import { addressesEqual, isValidSolanaAddress } from "@/lib/solana/address";

import {
  CONSENT_CLOCK_SKEW_MS,
  HARD_MAX_ACCOUNTS,
  HARD_MAX_COMPUTE_UNITS,
  HARD_MAX_INSTRUCTIONS,
  HARD_MAX_LAMPORTS_PER_SPONSOR_PER_DAY,
  HARD_MAX_LAMPORTS_PER_USER_PER_DAY,
  HARD_MAX_PER_SPONSOR_PER_DAY,
  HARD_MAX_PER_USER_PER_DAY,
  HARD_MAX_PER_USER_PER_HOUR,
  HARD_MAX_SIGNATURES,
  HARD_MAX_SPONSOR_FEE_LAMPORTS,
  HARD_MAX_TRANSACTION_BYTES,
  MAX_CONSENT_AGE_MS,
  SponsorError,
  type SponsorAbuseLimits,
  type SponsorCluster,
  type SponsorConsent,
  type SponsorDescriptor,
  type SponsorOption,
  type SponsorSelection,
  type SponsorUsageDecision,
  type SponsorUsageSnapshot,
  type SponsorUsageStore,
  type SponsorshipConfig,
} from "./contracts";

/**
 * Política de patrocinio. Todo es fail-closed:
 * - Flag apagado → no se patrocina.
 * - Sin sponsor registrado → no se patrocina.
 * - Sin consentimiento vigente → no se patrocina.
 * - Sin almacén de cuotas → no se patrocina.
 * - Configuración fuera de los topes duros → se rechaza.
 */

const CLUSTERS: readonly SponsorCluster[] = ["mainnet-beta", "devnet", "testnet"];

function isSponsorCluster(value: unknown): value is SponsorCluster {
  return typeof value === "string" && (CLUSTERS as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

export function isValidSponsorAbuseLimits(limits: SponsorAbuseLimits): boolean {
  if (!limits || typeof limits !== "object") return false;
  return (
    isPositiveInteger(limits.maxPerUserPerHour) &&
    limits.maxPerUserPerHour <= HARD_MAX_PER_USER_PER_HOUR &&
    isPositiveInteger(limits.maxPerUserPerDay) &&
    limits.maxPerUserPerDay <= HARD_MAX_PER_USER_PER_DAY &&
    isPositiveInteger(limits.maxPerSponsorPerDay) &&
    limits.maxPerSponsorPerDay <= HARD_MAX_PER_SPONSOR_PER_DAY &&
    isPositiveInteger(limits.maxLamportsPerUserPerDay) &&
    limits.maxLamportsPerUserPerDay <= HARD_MAX_LAMPORTS_PER_USER_PER_DAY &&
    isPositiveInteger(limits.maxLamportsPerSponsorPerDay) &&
    limits.maxLamportsPerSponsorPerDay <= HARD_MAX_LAMPORTS_PER_SPONSOR_PER_DAY &&
    isNonNegativeInteger(limits.cooldownMs)
  );
}

export function assertSponsorAbuseLimits(limits: SponsorAbuseLimits): void {
  if (!isValidSponsorAbuseLimits(limits)) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
}

/**
 * Valida la configuración completa antes de mirar una transacción. Un flag
 * encendido sin sponsors sigue siendo un rechazo: no existe un sponsor
 * "por defecto".
 */
export function assertSponsorshipConfig(config: SponsorshipConfig): void {
  if (!config || config.enabled !== true) {
    throw new SponsorError("SPONSOR_DISABLED");
  }
  if (!Array.isArray(config.sponsors) || config.sponsors.length === 0) {
    throw new SponsorError("SPONSOR_NOT_CONFIGURED");
  }
  if (!config.sponsors.every((sponsor) => Boolean(sponsor) && typeof sponsor === "object")) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (!isSponsorCluster(config.cluster)) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (
    !isPositiveInteger(config.maxFeeLamports) ||
    config.maxFeeLamports > HARD_MAX_SPONSOR_FEE_LAMPORTS ||
    !isPositiveInteger(config.maxTransactionBytes) ||
    config.maxTransactionBytes > HARD_MAX_TRANSACTION_BYTES ||
    !isPositiveInteger(config.maxSignatures) ||
    config.maxSignatures > HARD_MAX_SIGNATURES ||
    !isPositiveInteger(config.maxInstructions) ||
    config.maxInstructions > HARD_MAX_INSTRUCTIONS ||
    !isPositiveInteger(config.maxAccounts) ||
    config.maxAccounts > HARD_MAX_ACCOUNTS ||
    !isPositiveInteger(config.maxComputeUnits) ||
    config.maxComputeUnits > HARD_MAX_COMPUTE_UNITS
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (
    !Array.isArray(config.allowedPrograms) ||
    config.allowedPrograms.length === 0 ||
    !config.allowedPrograms.every(
      (program) => typeof program === "string" && isValidSolanaAddress(program),
    )
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
}

export function assertSponsorDescriptor(sponsor: SponsorDescriptor, config: SponsorshipConfig): void {
  if (!sponsor || sponsor.enabled !== true) {
    throw new SponsorError("SPONSOR_DISABLED");
  }
  if (
    typeof sponsor.id !== "string" ||
    sponsor.id.trim().length === 0 ||
    sponsor.id.length > 64 ||
    typeof sponsor.displayName !== "string" ||
    sponsor.displayName.trim().length === 0 ||
    sponsor.displayName.length > 120
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (typeof sponsor.feePayer !== "string" || !isValidSolanaAddress(sponsor.feePayer)) {
    throw new SponsorError("SPONSOR_NOT_CONFIGURED");
  }
  if (!Array.isArray(sponsor.clusters) || !sponsor.clusters.includes(config.cluster)) {
    throw new SponsorError("SPONSOR_NOT_CONFIGURED");
  }
  if (
    !isPositiveInteger(sponsor.maxFeeLamports) ||
    sponsor.maxFeeLamports > HARD_MAX_SPONSOR_FEE_LAMPORTS ||
    sponsor.maxFeeLamports > config.maxFeeLamports
  ) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  if (typeof sponsor.consentVersion !== "string" || sponsor.consentVersion.trim().length === 0) {
    throw new SponsorError("SPONSOR_POLICY_INVALID");
  }
  assertSponsorAbuseLimits(sponsor.limits);
}

export function findSponsor(config: SponsorshipConfig, sponsorId: string): SponsorDescriptor | null {
  const id = typeof sponsorId === "string" ? sponsorId.trim() : "";
  if (!id || !config || !Array.isArray(config.sponsors)) return null;
  return config.sponsors.find((sponsor) => sponsor && sponsor.id === id) ?? null;
}

/**
 * Nunca autoselecciona un sponsor. Sin id explícito, el usuario paga su
 * propia comisión (`self`).
 */
export function resolveSponsorSelection(input?: { readonly sponsorId?: string | null }): SponsorSelection {
  const sponsorId = typeof input?.sponsorId === "string" ? input.sponsorId.trim() : "";
  return sponsorId ? { mode: "sponsor", sponsorId } : { mode: "self" };
}

/** Opciones que una UI puede mostrar. Si el patrocinio está apagado, vacío. */
export function listSponsorOptions(config: SponsorshipConfig): SponsorOption[] {
  if (!config || config.enabled !== true || !Array.isArray(config.sponsors) || !isSponsorCluster(config.cluster)) {
    return [];
  }
  return config.sponsors
    .filter(
      (sponsor) =>
        Boolean(sponsor) &&
        sponsor.enabled === true &&
        Array.isArray(sponsor.clusters) &&
        sponsor.clusters.includes(config.cluster) &&
        isValidSolanaAddress(sponsor.feePayer),
    )
    .map((sponsor) => ({
      id: sponsor.id,
      displayName: sponsor.displayName,
      feePayer: sponsor.feePayer,
    }));
}

export interface SponsorSelectionCheckInput {
  readonly sponsor: SponsorDescriptor;
  readonly userId: string;
  readonly walletAddress: string;
  readonly consent: SponsorConsent;
  readonly now: number;
}

/**
 * Consentimiento y elegibilidad del usuario. El usuario debe haber aceptado
 * explícitamente que ESA empresa pague; no se hereda de otro sponsor.
 */
export function assertSponsorSelection(input: SponsorSelectionCheckInput): void {
  if (!Number.isFinite(input.now) || input.now <= 0) {
    throw new SponsorError("SPONSOR_LIMITER_UNAVAILABLE");
  }

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId || userId.length > 200) {
    throw new SponsorError("SPONSOR_USER_NOT_ELIGIBLE");
  }
  if (!input.sponsor || typeof input.sponsor.feePayer !== "string") {
    throw new SponsorError("SPONSOR_NOT_CONFIGURED");
  }
  if (
    typeof input.walletAddress !== "string" ||
    !isValidSolanaAddress(input.walletAddress)
  ) {
    throw new SponsorError("SPONSOR_USER_NOT_ELIGIBLE");
  }
  if (addressesEqual(input.walletAddress, input.sponsor.feePayer)) {
    throw new SponsorError("SPONSOR_SELF_PAYMENT");
  }

  const consent = input.consent;
  if (!consent || consent.accepted !== true) {
    throw new SponsorError("SPONSOR_CONSENT_REQUIRED");
  }
  if (
    typeof consent.sponsorId !== "string" ||
    consent.sponsorId !== input.sponsor.id ||
    typeof consent.version !== "string" ||
    consent.version !== input.sponsor.consentVersion
  ) {
    throw new SponsorError("SPONSOR_CONSENT_REQUIRED");
  }
  const acceptedAt = Date.parse(consent.acceptedAt);
  if (!Number.isFinite(acceptedAt)) {
    throw new SponsorError("SPONSOR_CONSENT_REQUIRED");
  }
  if (acceptedAt > input.now + CONSENT_CLOCK_SKEW_MS) {
    throw new SponsorError("SPONSOR_CONSENT_REQUIRED");
  }
  if (input.now - acceptedAt > MAX_CONSENT_AGE_MS) {
    throw new SponsorError("SPONSOR_CONSENT_REQUIRED");
  }
}

export interface SponsorUsageCheckInput {
  readonly snapshot: SponsorUsageSnapshot;
  readonly limits: SponsorAbuseLimits;
  readonly feeLamports: number;
  readonly now: number;
}

/**
 * Chequeo puro de cuotas. Una implementación de `SponsorUsageStore` puede
 * reutilizarlo dentro de su operación atómica. Nunca devuelve `allowed: true`
 * con datos inválidos o incompletos.
 */
export function checkSponsorUsageLimits(input: SponsorUsageCheckInput): SponsorUsageDecision {
  if (!isValidSponsorAbuseLimits(input.limits)) {
    return { allowed: false, code: "SPONSOR_POLICY_INVALID" };
  }
  if (!Number.isFinite(input.now) || input.now <= 0) {
    return { allowed: false, code: "SPONSOR_LIMITER_UNAVAILABLE" };
  }
  if (
    !isPositiveInteger(input.feeLamports) ||
    input.feeLamports > HARD_MAX_SPONSOR_FEE_LAMPORTS
  ) {
    return { allowed: false, code: "SPONSOR_POLICY_INVALID" };
  }

  const snapshot = input.snapshot;
  if (
    !snapshot ||
    !isNonNegativeInteger(snapshot.userHourCount) ||
    !isNonNegativeInteger(snapshot.userDayCount) ||
    !isNonNegativeInteger(snapshot.sponsorDayCount) ||
    !isNonNegativeInteger(snapshot.userDayLamports) ||
    !isNonNegativeInteger(snapshot.sponsorDayLamports)
  ) {
    return { allowed: false, code: "SPONSOR_LIMITER_UNAVAILABLE" };
  }

  if (snapshot.lastUserSponsorshipAt !== null) {
    const last = snapshot.lastUserSponsorshipAt;
    if (!Number.isFinite(last) || last < 0 || last > input.now + CONSENT_CLOCK_SKEW_MS) {
      return { allowed: false, code: "SPONSOR_LIMITER_UNAVAILABLE" };
    }
    if (input.now - last < input.limits.cooldownMs) {
      return { allowed: false, code: "SPONSOR_COOLDOWN" };
    }
  }

  if (snapshot.userHourCount >= input.limits.maxPerUserPerHour) {
    return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
  }
  if (snapshot.userDayCount >= input.limits.maxPerUserPerDay) {
    return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
  }
  if (snapshot.sponsorDayCount >= input.limits.maxPerSponsorPerDay) {
    return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
  }
  if (snapshot.userDayLamports + input.feeLamports > input.limits.maxLamportsPerUserPerDay) {
    return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
  }
  if (snapshot.sponsorDayLamports + input.feeLamports > input.limits.maxLamportsPerSponsorPerDay) {
    return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
  }

  return {
    allowed: true,
    remaining: Math.max(0, input.limits.maxPerUserPerDay - snapshot.userDayCount - 1),
  };
}

/**
 * Almacén por defecto: deniega siempre. Es el estado seguro hasta que exista
 * un store durable y atómico (Redis/Postgres) con las cuotas por usuario y
 * por empresa. No se implementa memoria local para producción porque no es
 * global entre instancias.
 */
export const DENY_ALL_SPONSOR_USAGE_STORE: SponsorUsageStore = Object.freeze({
  async reserve(): Promise<SponsorUsageDecision> {
    return { allowed: false, code: "SPONSOR_LIMITER_UNAVAILABLE" };
  },
});
