import "server-only";

/**
 * Contratos del patrocinio de comisiones de red (fee-payer).
 *
 * Reglas de este módulo:
 * - Sólo se guardan direcciones PÚBLICAS. Nunca una clave privada, seed ni
 *   material de firma en env, código, logs o tipos.
 * - El patrocinio está apagado por defecto (`SPONSOR_ENABLED=false`). La
 *   configuración de ejemplo no trae sponsors: sin registro explícito no hay
 *   patrocinio, aunque el flag esté en true.
 * - La firma real vive detrás de `SponsorKms`; este repositorio no incluye
 *   ninguna implementación con claves.
 * - El usuario elige explícitamente si paga él (`self`) o si paga una empresa
 *   (`sponsor`). Nunca se elige un sponsor por defecto.
 */

export const SPONSORSHIP_VERSION = 1 as const;

/** Techo absoluto de comisión que Maverlang acepta patrocinar por transacción. */
export const HARD_MAX_SPONSOR_FEE_LAMPORTS = 10_000_000; // 0,01 SOL
/** Tamaño máximo de una transacción Solana (wire format). */
export const HARD_MAX_TRANSACTION_BYTES = 1_232;
/** Firmas requeridas máximas (sponsor + usuario + margen acotado). */
export const HARD_MAX_SIGNATURES = 4;
/** Instrucciones máximas por transacción. */
export const HARD_MAX_INSTRUCTIONS = 64;
/** Cuentas estáticas máximas por transacción. */
export const HARD_MAX_ACCOUNTS = 64;
/** Límite de compute units de Solana por transacción. */
export const HARD_MAX_COMPUTE_UNITS = 1_400_000;

/** Un consentimiento más viejo que esto obliga a pedirlo de nuevo. */
export const MAX_CONSENT_AGE_MS = 365 * 24 * 60 * 60 * 1_000;
/** Tolerancia de reloj al validar `acceptedAt`. */
export const CONSENT_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/** Topes duros de abuso, incluso si una configuración pide más. */
export const HARD_MAX_PER_USER_PER_HOUR = 10;
export const HARD_MAX_PER_USER_PER_DAY = 30;
export const HARD_MAX_PER_SPONSOR_PER_DAY = 5_000;
export const HARD_MAX_LAMPORTS_PER_USER_PER_DAY = 20_000_000; // 0,02 SOL
export const HARD_MAX_LAMPORTS_PER_SPONSOR_PER_DAY = 100_000_000; // 0,1 SOL

/* Programas públicos conocidos. No son secretos. */
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const JUPITER_V6_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

/**
 * Allowlist conservadora por defecto. Cualquier programa nuevo (por ejemplo
 * el router v2/RFQ de Jupiter o un programa de DEX) exige revisión y se
 * agrega explícitamente en la configuración; no se infiere por nombre.
 */
export const CORE_SPONSOR_PROGRAMS: readonly string[] = Object.freeze([
  SYSTEM_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
]);

export const DEFAULT_SPONSOR_PROGRAMS: readonly string[] = Object.freeze([
  ...CORE_SPONSOR_PROGRAMS,
  JUPITER_V6_PROGRAM_ID,
]);

export type SponsorCluster = "mainnet-beta" | "devnet" | "testnet";

export type SponsorErrorCode =
  | "SPONSOR_DISABLED"
  | "SPONSOR_NOT_CONFIGURED"
  | "SPONSOR_UNKNOWN"
  | "SPONSOR_POLICY_INVALID"
  | "SPONSOR_REQUEST_INVALID"
  | "SPONSOR_USER_NOT_ELIGIBLE"
  | "SPONSOR_SELF_PAYMENT"
  | "SPONSOR_CONSENT_REQUIRED"
  | "SPONSOR_LIMIT_EXCEEDED"
  | "SPONSOR_COOLDOWN"
  | "SPONSOR_LIMITER_UNAVAILABLE"
  | "SPONSOR_SIGNER_UNAVAILABLE"
  | "SPONSOR_KEY_MISMATCH"
  | "SPONSOR_KMS_REQUIRED"
  | "SPONSOR_TRANSACTION_INVALID"
  | "SPONSOR_TRANSACTION_TOO_LARGE"
  | "SPONSOR_UNSUPPORTED_VERSION"
  | "SPONSOR_ALT_NOT_SUPPORTED"
  | "SPONSOR_FEE_PAYER_MISMATCH"
  | "SPONSOR_UNEXPECTED_SIGNER"
  | "SPONSOR_ALREADY_SIGNED"
  | "SPONSOR_PROGRAM_NOT_ALLOWED"
  | "SPONSOR_INSTRUCTION_ACCOUNT_NOT_ALLOWED"
  | "SPONSOR_FEE_TOO_HIGH"
  | "SPONSOR_BLOCKHASH_MISMATCH"
  | "SPONSOR_SIGNATURE_INVALID";

/**
 * Mensajes fijos en español de Chile. Nunca interpolan la transacción, la
 * firma, direcciones ni mensajes crudos de librerías: así un log o una
 * respuesta de error no filtra contenido sensible.
 */
const SPONSOR_ERROR_MESSAGES: Record<SponsorErrorCode, string> = {
  SPONSOR_DISABLED: "El patrocinio de comisiones de red no está habilitado.",
  SPONSOR_NOT_CONFIGURED: "No hay una empresa de patrocinio configurada.",
  SPONSOR_UNKNOWN: "La empresa de patrocinio elegida no existe.",
  SPONSOR_POLICY_INVALID: "La configuración de patrocinio no es válida.",
  SPONSOR_REQUEST_INVALID: "La solicitud de patrocinio no es válida.",
  SPONSOR_USER_NOT_ELIGIBLE: "La billetera no es elegible para patrocinio.",
  SPONSOR_SELF_PAYMENT: "La billetera del usuario no puede ser el fee-payer patrocinado.",
  SPONSOR_CONSENT_REQUIRED: "Falta el consentimiento vigente para que una empresa pague la comisión.",
  SPONSOR_LIMIT_EXCEEDED: "Se alcanzó el límite de patrocinios permitido.",
  SPONSOR_COOLDOWN: "Debes esperar antes de volver a pedir patrocinio.",
  SPONSOR_LIMITER_UNAVAILABLE: "El control de límites de patrocinio no está disponible.",
  SPONSOR_SIGNER_UNAVAILABLE: "El firmante del patrocinador no está disponible.",
  SPONSOR_KEY_MISMATCH: "El firmante no corresponde al fee-payer registrado.",
  SPONSOR_KMS_REQUIRED: "El patrocinio requiere un KMS/HSM; no hay firma configurada.",
  SPONSOR_TRANSACTION_INVALID: "La transacción no es válida para patrocinio.",
  SPONSOR_TRANSACTION_TOO_LARGE: "La transacción supera el tamaño permitido.",
  SPONSOR_UNSUPPORTED_VERSION: "La versión de la transacción no está soportada.",
  SPONSOR_ALT_NOT_SUPPORTED: "La transacción usa tablas de direcciones no soportadas todavía.",
  SPONSOR_FEE_PAYER_MISMATCH: "El fee-payer de la transacción no es el patrocinador.",
  SPONSOR_UNEXPECTED_SIGNER: "La transacción pide una firma que el patrocinio no autoriza.",
  SPONSOR_ALREADY_SIGNED: "La transacción ya viene firmada por el patrocinador.",
  SPONSOR_PROGRAM_NOT_ALLOWED: "La transacción invoca un programa no permitido.",
  SPONSOR_INSTRUCTION_ACCOUNT_NOT_ALLOWED: "La transacción usa la cuenta del patrocinador en una instrucción.",
  SPONSOR_FEE_TOO_HIGH: "La comisión de red supera el máximo patrocinado.",
  SPONSOR_BLOCKHASH_MISMATCH: "El blockhash de la transacción no coincide con el esperado.",
  SPONSOR_SIGNATURE_INVALID: "La firma del patrocinador no es válida.",
};

export class SponsorError extends Error {
  readonly code: SponsorErrorCode;

  constructor(code: SponsorErrorCode, message: string = SPONSOR_ERROR_MESSAGES[code]) {
    super(message);
    this.name = "SponsorError";
    this.code = code;
  }
}

/** Elección del usuario: pagar él mismo o que pague una empresa. */
export type SponsorSelection =
  | { readonly mode: "self" }
  | { readonly mode: "sponsor"; readonly sponsorId: string };

/** Consentimiento explícito y versionado para que una empresa pague. */
export interface SponsorConsent {
  readonly accepted: true;
  /** Empresa concreta que el usuario eligió; evita reutilizar otro consentimiento. */
  readonly sponsorId: string;
  readonly version: string;
  /** ISO-8601. Se valida contra el reloj del servidor. */
  readonly acceptedAt: string;
}

export interface SponsorAbuseLimits {
  readonly maxPerUserPerHour: number;
  readonly maxPerUserPerDay: number;
  readonly maxPerSponsorPerDay: number;
  readonly maxLamportsPerUserPerDay: number;
  readonly maxLamportsPerSponsorPerDay: number;
  readonly cooldownMs: number;
}

/**
 * Empresa que paga. `feePayer` es una dirección pública; nunca una clave.
 * `enabled` permite apagar una empresa sin borrar su configuración.
 */
export interface SponsorDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly feePayer: string;
  readonly enabled: boolean;
  readonly clusters: readonly SponsorCluster[];
  readonly maxFeeLamports: number;
  readonly consentVersion: string;
  readonly limits: SponsorAbuseLimits;
}

/**
 * Configuración completa. `sponsors: []` es el estado seguro y esperado
 * hasta que exista un registro aprobado y un KMS.
 */
export interface SponsorshipConfig {
  readonly enabled: boolean;
  readonly cluster: SponsorCluster;
  readonly sponsors: readonly SponsorDescriptor[];
  readonly maxFeeLamports: number;
  readonly maxTransactionBytes: number;
  readonly maxSignatures: number;
  readonly maxInstructions: number;
  readonly maxAccounts: number;
  readonly maxComputeUnits: number;
  readonly allowedPrograms: readonly string[];
}

/** Opción pública para que la UI muestre quién puede pagar. Sin secretos. */
export interface SponsorOption {
  readonly id: string;
  readonly displayName: string;
  readonly feePayer: string;
}

export interface SponsorUsageSnapshot {
  readonly userHourCount: number;
  readonly userDayCount: number;
  readonly sponsorDayCount: number;
  readonly userDayLamports: number;
  readonly sponsorDayLamports: number;
  readonly lastUserSponsorshipAt: number | null;
}

export interface SponsorUsageDecision {
  readonly allowed: boolean;
  readonly code?: SponsorErrorCode;
  readonly remaining?: number;
}

/** Reserva atómica antes de firmar. `release` deshace si la firma falla. */
export interface SponsorReservation {
  readonly requestId: string;
  readonly sponsorId: string;
  readonly userId: string;
  readonly feeLamports: number;
  readonly now: number;
  /** SHA-256 del mensaje; sirve como clave de idempotencia. */
  readonly messageSha256: string;
  /** Límites ya validados del sponsor; el store puede reutilizarlos. */
  readonly limits: SponsorAbuseLimits;
}

/**
 * Almacén durable y atómico de cuotas. La implementación real debe ser
 * compartida entre instancias (Redis/Postgres) y negarse si no puede
 * garantizar atomicidad. Por defecto se usa una implementación que deniega.
 */
export interface SponsorUsageStore {
  reserve(input: SponsorReservation): Promise<SponsorUsageDecision>;
  release?(input: SponsorReservation): Promise<void>;
}

export interface SponsorTransactionLimits {
  readonly sponsorFeePayer: string;
  readonly userWallet: string;
  readonly expectedRecentBlockhash: string;
  readonly expectedMessageSha256?: string;
  readonly maxFeeLamports: number;
  readonly maxTransactionBytes: number;
  readonly maxSignatures: number;
  readonly maxInstructions: number;
  readonly maxAccounts: number;
  readonly maxComputeUnits: number;
  readonly allowedPrograms: readonly string[];
}

export interface SponsorFeeEstimate {
  readonly baseFeeLamports: number;
  readonly priorityFeeLamports: number;
  readonly totalFeeLamports: number;
  readonly computeUnitLimit: number;
  readonly computeUnitPriceMicroLamports: number;
}

declare const validatedSponsorshipBrand: unique symbol;

/**
 * Transacción ya inspeccionada y aprobada. La marca es de tipos: sólo
 * `validateSponsorTransaction` la produce. Un `SponsorKms` debe aceptar
 * únicamente esta forma, nunca base64 arbitrario.
 */
export interface ValidatedSponsorship {
  readonly [validatedSponsorshipBrand]: true;
  readonly transactionBase64: string;
  readonly transactionBytes: number;
  readonly sponsorFeePayer: string;
  readonly userWallet: string;
  readonly recentBlockhash: string;
  readonly messageSha256: string;
  readonly fee: SponsorFeeEstimate;
  readonly programIds: readonly string[];
  readonly instructionCount: number;
  readonly accountCount: number;
  readonly userSignaturePresent: boolean;
}

/**
 * Datos de una transacción ya validada, sin la marca de tipos. Sólo
 * `validateSponsorTransaction` debe convertirlos a `ValidatedSponsorship`
 * tras terminar todas las comprobaciones.
 */
export type ValidatedSponsorshipData = Omit<
  ValidatedSponsorship,
  typeof validatedSponsorshipBrand
>;

export interface SponsorSignInput {
  readonly transactionBase64: string;
  readonly sponsorFeePayer: string;
  readonly messageSha256: string;
}

export interface SponsorSignOutput {
  readonly signedTransactionBase64: string;
}

/**
 * Firma del fee-payer. La implementación debe usar KMS/HSM o una wallet
 * gestionada; jamás leer una clave privada desde env, código o logs.
 * `feePayer` es sólo la dirección pública.
 */
export interface SponsorKms {
  readonly feePayer: string;
  signFeePayer(input: SponsorSignInput): Promise<SponsorSignOutput>;
}

export interface SponsorshipRequest {
  /** Idempotencia/auditoría. No se registra contenido de la transacción. */
  readonly requestId: string;
  readonly sponsorId: string;
  /** Id interno del usuario autenticado; nunca uno enviado por el cliente. */
  readonly userId: string;
  /** Billetera verificada en el servidor; nunca una dirección arbitraria del cliente. */
  readonly walletAddress: string;
  readonly consent: SponsorConsent;
  readonly transactionBase64: string;
  /** Blockhash que el servidor guardó al construir la transacción. */
  readonly expectedRecentBlockhash: string;
  /** SHA-256 del mensaje que el servidor guardó al construir la transacción. */
  readonly expectedMessageSha256: string;
}

export interface SponsorshipDeps {
  readonly config: SponsorshipConfig;
  readonly usage: SponsorUsageStore;
  readonly signer: SponsorKms | null;
  readonly now?: () => number;
}

export interface SponsorshipResult {
  readonly requestId: string;
  readonly sponsorId: string;
  readonly feePayer: string;
  readonly signedTransactionBase64: string;
  readonly messageSha256: string;
  readonly fee: SponsorFeeEstimate;
}
