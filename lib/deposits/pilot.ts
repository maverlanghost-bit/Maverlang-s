import "server-only";

import { DomainError } from "@/lib/api/result";

/**
 * Piloto interno de depósitos USDC (sólo equipo).
 *
 * La lista vive SÓLO en el servidor (`DEPOSIT_ALLOWLIST_EMAILS`, separada por
 * comas). No existe una variable `NEXT_PUBLIC_*` ni un endpoint que la
 * publique: el cliente jamás recibe correos ni decide quién está dentro.
 *
 * Regla: un depósito sólo se acredita si la identidad de Supabase tiene un
 * correo **verificado** (`email_confirmed_at`) y ese correo, normalizado
 * (trim + minúsculas), está exactamente en la lista. Falta de lista, lista
 * vacía, correo ausente, correo sin verificar, error al leer el correo o
 * formato inválido → denegado. Nunca hay excepción "por defecto".
 *
 * Esto es una excepción explícita y acotada del piloto: NO relaja KYC para el
 * resto de las cuentas ni enciende ningún flag de dinero. Los flags
 * `deposits_enabled` y `WALLET_DEPOSIT_SYNC` siguen siendo necesarios y siguen
 * apagados por defecto.
 */

/** Nombre de la variable (sólo servidor). Nunca se expone al cliente. */
export const DEPOSIT_ALLOWLIST_ENV = "DEPOSIT_ALLOWLIST_EMAILS";

/** Mensaje único de denegación (no revela si el correo existe o no). */
export const DEPOSIT_PILOT_DENIED_MESSAGE =
  "Los depósitos USDC están en un piloto interno cerrado. Esta cuenta no está habilitada.";

export type DepositPilotReason =
  | "allowlisted"
  | "not_configured"
  | "missing_email"
  | "email_not_verified"
  | "not_allowlisted";

export interface DepositPilotIdentity {
  email?: string | null;
  emailVerified?: boolean | null;
}

export interface DepositPilotDecision {
  allowed: boolean;
  reason: DepositPilotReason;
}

/**
 * Normaliza un correo para comparar: sin espacios al borde y en minúsculas.
 * No aplica reglas de proveedor (puntos de Gmail, subdirecciones, etc.):
 * "exacto normalizado" es trim + minúsculas sobre el correo verificado.
 * Devuelve `null` si no tiene una forma de correo aceptable.
 */
export function normalizeDepositEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;
  // Exactamente una @, sin espacios ni comas (la coma separa la lista), y un
  // punto en el dominio. No se intenta validar RFC completa: se evita que una
  // entrada basura de la variable pueda coincidir con algo.
  if (/\s/.test(trimmed) || trimmed.includes(",")) return null;
  if (trimmed.split("@").length !== 2) return null;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain || !domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".")) return null;
  return trimmed;
}

/**
 * Lee la lista del proceso. `undefined`/vacío → conjunto vacío, que deniega a
 * todos. Las entradas inválidas se descartan (no amplían el acceso).
 */
export function parseDepositAllowlist(raw?: string | null): Set<string> {
  const source = raw ?? process.env[DEPOSIT_ALLOWLIST_ENV] ?? "";
  const emails = new Set<string>();
  for (const part of source.split(",")) {
    const email = normalizeDepositEmail(part);
    if (email) emails.add(email);
  }
  return emails;
}

/** `true` sólo si la variable existe y contiene al menos un correo válido. */
export function depositPilotConfigured(raw?: string | null): boolean {
  return parseDepositAllowlist(raw).size > 0;
}

/**
 * Decide si una identidad entra al piloto. Puro y fail-closed: cualquier duda
 * (sin lista, sin correo, sin verificación, error del llamador) deniega.
 */
export function depositPilotDecision(
  identity: DepositPilotIdentity | null | undefined,
  raw?: string | null,
): DepositPilotDecision {
  const allowlist = parseDepositAllowlist(raw);
  if (allowlist.size === 0) return { allowed: false, reason: "not_configured" };
  const email = normalizeDepositEmail(identity?.email);
  if (!email) return { allowed: false, reason: "missing_email" };
  if (identity?.emailVerified !== true) return { allowed: false, reason: "email_not_verified" };
  if (!allowlist.has(email)) return { allowed: false, reason: "not_allowlisted" };
  return { allowed: true, reason: "allowlisted" };
}

/** `true` sólo con lista configurada, correo verificado y coincidencia exacta. */
export function depositPilotAllows(
  identity: DepositPilotIdentity | null | undefined,
  raw?: string | null,
): boolean {
  return depositPilotDecision(identity, raw).allowed;
}

/**
 * Guardia para rutas y servicios de servidor. Lanza `REAL_DISABLED` (503) con
 * el mensaje del piloto: no distingue entre "fuera de la lista" y "sin lista".
 */
export function assertDepositPilotAllowed(
  identity: DepositPilotIdentity | null | undefined,
  raw?: string | null,
): void {
  if (!depositPilotAllows(identity, raw)) {
    throw new DomainError("REAL_DISABLED", DEPOSIT_PILOT_DENIED_MESSAGE);
  }
}
