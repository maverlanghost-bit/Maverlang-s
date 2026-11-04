import { isOperationBlocked, normalizeCountry } from "@/config/compliance";
import {
  checkUsPersonDeclaration,
  currentUsPersonDeclarationVersion,
  type DeclarationBlockReason,
  type UsPersonDeclaration,
} from "@/lib/compliance/us-person";

/** Campos que el cliente puede mandar al guardar el onboarding (M75/DB-03). */
export type ComplianceWriteInput = {
  residenceCountry?: string | null;
  nationalityCountry?: string | null;
  usPersonDeclarationVersion?: string | null;
  /** Respuesta explícita: `"no"` es la única que se puede persistir. */
  usPersonDeclaration?: UsPersonDeclaration | null;
};

export type DeclarationRecord = {
  residence_country: string | null;
  nationality_country: string | null;
  is_us_person: false;
  us_person_declared_at: string;
  us_person_declaration_version: string;
  consent: { doc: "us_person"; version: string; accepted_at: string };
};

/**
 * Lo que queda en `profiles` y en `consents` cuando la persona responde
 * explícitamente que no es U.S. person. Si respondió "sí" o no respondió,
 * no hay registro: no se arma la fila.
 */
export function declarationRecord(input: {
  residenceCountry: string | null;
  nationalityCountry: string | null;
  usPersonDeclaration: UsPersonDeclaration | null;
  version?: string | null;
  declaredAt: string;
}):
  | DeclarationRecord
  | { blocked: true; reason: "residence" | "nationality" | DeclarationBlockReason } {
  const residence = normalizeCountry(input.residenceCountry);
  const nationality = normalizeCountry(input.nationalityCountry);
  if (isOperationBlocked(residence)) return { blocked: true, reason: "residence" };
  if (isOperationBlocked(nationality)) return { blocked: true, reason: "nationality" };
  if (input.usPersonDeclaration === "yes") return { blocked: true, reason: "us_person" };
  if (input.usPersonDeclaration !== "no") return { blocked: true, reason: "unanswered" };
  // La versión persiste es la del servidor. Si el llamador trae una, tiene que
  // coincidir exactamente; nunca se guarda el texto del cliente.
  const expected = currentUsPersonDeclarationVersion();
  const requested = input.version?.trim() ?? "";
  if (requested && requested !== expected) return { blocked: true, reason: "version_mismatch" };
  const version = expected;
  return {
    residence_country: residence,
    nationality_country: nationality,
    is_us_person: false,
    us_person_declared_at: input.declaredAt,
    us_person_declaration_version: version,
    consent: { doc: "us_person", version, accepted_at: input.declaredAt },
  };
}

/**
 * Columnas de cumplimiento del UPDATE de `profiles`.
 *
 * - `null`: no se está declarando nada (un cambio de teléfono no la reescribe).
 * - `{ blocked }`: la declaración impide guardar; el llamador decide el error.
 * - columnas: sólo se arman con una respuesta explícita "no" y versión.
 *
 * `onboardingCompleted` entra al chequeo: al finalizar el onboarding no se
 * puede omitir la respuesta ni la versión.
 */
export function complianceDbColumns(
  patch: ComplianceWriteInput & { country?: string | null; onboardingCompleted?: boolean },
  declaredAt: string,
): Record<string, string | boolean | null> | { blocked: DeclarationBlockReason } | null {
  const check = checkUsPersonDeclaration({
    usPersonDeclaration: patch.usPersonDeclaration,
    usPersonDeclarationVersion: patch.usPersonDeclarationVersion,
    onboardingCompleted: patch.onboardingCompleted,
  });
  if (check.kind === "blocked") return { blocked: check.reason };
  if (check.kind !== "declared") return null;

  const columns: Record<string, string | boolean | null> = {
    is_us_person: false,
    us_person_declaration_version: check.version,
    us_person_declared_at: declaredAt,
  };
  // No pisar residencia/nacionalidad existentes con null cuando el cuerpo no
  // las trae: la RPC 0043 rechaza cambiar cumplimiento tras el onboarding.
  if (patch.residenceCountry !== undefined || patch.country !== undefined) {
    columns.residence_country = normalizeCountry(patch.residenceCountry ?? patch.country);
  }
  if (patch.nationalityCountry !== undefined) {
    columns.nationality_country = normalizeCountry(patch.nationalityCountry);
  }
  return columns;
}

/** Type guard para separar `{ blocked }` de las columnas (TS no lo infiere solo). */
export function isBlockedCompliance(
  value: unknown,
): value is { blocked: DeclarationBlockReason } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { blocked?: unknown }).blocked === "string"
  );
}
