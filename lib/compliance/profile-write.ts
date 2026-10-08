import { US_PERSON_DECLARATION_VERSION, isOperationBlocked, normalizeCountry } from "@/config/compliance";

/** Campos que el cliente puede mandar al guardar el onboarding (M75). */
export type ComplianceWriteInput = {
  residenceCountry?: string | null;
  nationalityCountry?: string | null;
  usPersonDeclarationVersion?: string | null;
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
 * Lo que queda en `profiles` y en `consents` cuando la persona declara que
 * no es U.S. person. Si residencia o nacionalidad están bloqueadas, no hay
 * registro: no se arma la fila.
 */
export function declarationRecord(input: {
  residenceCountry: string | null;
  nationalityCountry: string | null;
  version?: string | null;
  declaredAt: string;
}): DeclarationRecord | { blocked: true; reason: "residence" | "nationality" } {
  const residence = normalizeCountry(input.residenceCountry);
  const nationality = normalizeCountry(input.nationalityCountry);
  if (isOperationBlocked(residence)) return { blocked: true, reason: "residence" };
  if (isOperationBlocked(nationality)) return { blocked: true, reason: "nationality" };
  const version = input.version?.trim() || US_PERSON_DECLARATION_VERSION;
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
 * Columnas extra del UPDATE de `profiles`. Null si el cliente no mandó la
 * versión: un cambio de teléfono no reescribe la declaración.
 */
export function complianceDbColumns(
  patch: ComplianceWriteInput & { country?: string | null },
  declaredAt: string,
): Record<string, string | boolean | null> | null {
  const version = patch.usPersonDeclarationVersion?.trim();
  if (!version) return null;
  const residence = normalizeCountry(patch.residenceCountry ?? patch.country);
  const nationality = normalizeCountry(patch.nationalityCountry);
  return {
    residence_country: residence,
    nationality_country: nationality,
    is_us_person: false,
    us_person_declaration_version: version,
    us_person_declared_at: declaredAt,
  };
}
