import "server-only";

import { DomainError } from "@/lib/api/result";

/**
 * Regla de identidad para depósitos USDC (cuentas registradas).
 *
 * El archivo conserva su ruta histórica porque antes era el piloto interno
 * con lista de correos (`DEPOSIT_ALLOWLIST_EMAILS`). Esa lista YA NO EXISTE:
 * no hay variable de entorno, ni lista por defecto, ni excepción de equipo.
 * Cualquier cuenta registrada cuyo correo esté VERIFICADO en Supabase Auth
 * (`email_confirmed_at`) es elegible.
 *
 * Por qué se mantiene el correo verificado como regla general: es la única
 * marca del proveedor que acredita que la persona controla el correo de la
 * cuenta. Un correo sin confirmar (o confirmado sólo por teléfono) no sirve
 * como identidad para recibir dinero ni como canal de recuperación, y además
 * se cruza con los correos del DID de Privy al vincular la billetera. Sin
 * correo legible o sin verificación → denegado (fail-closed). Esto NO es KYC:
 * la habilitación legal/compliance de fondos reales sigue siendo un paso
 * aparte y no se afirma aquí.
 *
 * Esta regla no enciende ningún flag de dinero: `deposits_enabled` y
 * `WALLET_DEPOSIT_SYNC` siguen siendo necesarios y siguen apagados por
 * defecto.
 */

/** Mensaje único de denegación (no revela datos de la cuenta). */
export const DEPOSIT_IDENTITY_DENIED_MESSAGE =
  "Para depositar USDC necesitamos que el correo de tu cuenta esté verificado.";

export type DepositEligibilityReason =
  | "verified"
  | "missing_email"
  | "email_not_verified";

export interface DepositIdentity {
  email?: string | null;
  emailVerified?: boolean | null;
}

export interface DepositEligibilityDecision {
  allowed: boolean;
  reason: DepositEligibilityReason;
}

/**
 * Normaliza un correo para comparar: sin espacios al borde y en minúsculas.
 * No aplica reglas de proveedor (puntos de Gmail, subdirecciones, etc.).
 * Devuelve `null` si no tiene una forma de correo aceptable.
 */
export function normalizeDepositEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;
  // Exactamente una @, sin espacios ni comas, y un punto en el dominio. No se
  // intenta validar RFC completa: sólo se evita que un dato basura pase como
  // identidad.
  if (/\s/.test(trimmed) || trimmed.includes(",")) return null;
  if (trimmed.split("@").length !== 2) return null;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain || !domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".")) return null;
  return trimmed;
}

/**
 * Decide si una identidad puede depositar. Puro y fail-closed: correo ausente
 * o mal formado, correo sin verificar o error del llamador → denegado. No hay
 * lista de correos ni excepción "por defecto".
 */
export function depositEligibilityDecision(
  identity: DepositIdentity | null | undefined,
): DepositEligibilityDecision {
  const email = normalizeDepositEmail(identity?.email);
  if (!email) return { allowed: false, reason: "missing_email" };
  if (identity?.emailVerified !== true) return { allowed: false, reason: "email_not_verified" };
  return { allowed: true, reason: "verified" };
}

/** `true` sólo con correo legible y verificado por Supabase Auth. */
export function depositIdentityAllows(
  identity: DepositIdentity | null | undefined,
): boolean {
  return depositEligibilityDecision(identity).allowed;
}

/**
 * Guardia para rutas y servicios de servidor. Lanza `REAL_DISABLED` (503) con
 * el mensaje de identidad: no distingue entre "sin correo", "correo inválido"
 * y "correo sin verificar".
 */
export function assertDepositIdentityAllowed(
  identity: DepositIdentity | null | undefined,
): void {
  if (!depositIdentityAllows(identity)) {
    throw new DomainError("REAL_DISABLED", DEPOSIT_IDENTITY_DENIED_MESSAGE);
  }
}
