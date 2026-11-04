import "server-only";

import {
  US_PERSON_DECLARATION_TEXT,
  US_PERSON_QUESTION,
  US_PERSON_UNANSWERED_MESSAGE,
  US_PERSON_VERSION_REQUIRED_MESSAGE,
  US_PERSON_YES_LABEL,
  type UsPersonDeclaration,
} from "@/config/compliance";
import { US_RESIDENT_MESSAGE } from "@/lib/auth/registro-schema";
import { serverEnv } from "@/lib/env";

/**
 * Declaración U.S. person (DB-03).
 *
 * La respuesta viaja como `"yes" | "no"`, nunca como un booleano con valor
 * por defecto. `null` (o la ausencia del campo) significa "no respondió" y
 * bloquea el alta/onboarding. Sólo `"no"` se puede persistir como
 * `is_us_person = false`; `"yes"` se rechaza con el mismo patrón de acceso
 * bloqueado que ya usan los wizards.
 *
 * La versión NO se confía al cliente: se compara contra
 * `serverEnv.US_PERSON_DECLARATION_VERSION`. Una versión arbitraria, vieja o
 * futura (`"v1"`, `"2026-09-draft"`, un texto inventado) se rechaza con
 * `version_mismatch`, y lo que se persiste es siempre la versión del servidor.
 *
 * ---------------------------------------------------------------------------
 * DB-03: la misma versión tiene que vivir en la base de datos.
 *
 * Esta capa cubre `/api/me` y los servicios de `users`, pero no es el único
 * camino de escritura:
 *   1. `public.update_my_profile(jsonb)` (0043/0044/0045/0046) tiene EXECUTE
 *      para `authenticated`: un cliente puede llamarla por PostgREST sin pasar
 *      por Next. Hoy sólo exige versión no vacía y <= 64 caracteres, así que
 *      aceptaría cualquier texto.
 *   2. El alta de Supabase Auth (`signUp`/`updateUser` con `user_metadata`)
 *      escribe `us_person_declaration_version` desde el metadata del cliente;
 *      el trigger `handle_new_user` (0015) confía en ese valor.
 *   3. `services.users.addConsent` acepta un `Consent` con `doc: "us_person"`
 *      y versión libre si lo llama un camino interno (las rutas públicas sólo
 *      permiten terminos/privacidad/riesgos).
 *
 * Por eso falta una migración (no incluida acá) que compare la versión contra
 * una fuente de verdad de la DB —una tabla de versiones de cumplimiento o una
 * constante/CHECK actualizada junto con `US_PERSON_DECLARATION_VERSION`— y que
 * la RPC/trigger rechacen `version_declaracion_no_vigente`. Mientras esa
 * migración no exista, cambiar `serverEnv.US_PERSON_DECLARATION_VERSION` sin
 * actualizar la DB deja una ventana que sólo este módulo cierra.
 * ---------------------------------------------------------------------------
 */
export type { UsPersonDeclaration };
export {
  US_PERSON_DECLARATION_TEXT,
  US_PERSON_QUESTION,
  US_PERSON_UNANSWERED_MESSAGE,
  US_PERSON_VERSION_REQUIRED_MESSAGE,
  US_PERSON_YES_LABEL,
};

export type DeclarationBlockReason =
  | "us_person"
  | "unanswered"
  | "missing_version"
  /** La versión enviada no es exactamente la vigente en el servidor. */
  | "version_mismatch";

export type DeclarationCheck =
  /** No se está guardando una declaración ni completando el onboarding. */
  | { kind: "not_requested" }
  /** Respuesta explícita "no", con la versión vigente del servidor. */
  | { kind: "declared"; declaration: "no"; version: string }
  /** No se puede completar ni persistir. */
  | { kind: "blocked"; reason: DeclarationBlockReason };

export const US_PERSON_DECLARATION_CONSENT = "us_person";

/** Mensaje para una versión vieja o inventada. No hay reintento silencioso. */
export const US_PERSON_VERSION_MISMATCH_MESSAGE =
  "La declaración cambió. Vuelve a leerla y acéptala de nuevo.";

export function isUsPersonDeclaration(value: unknown): value is UsPersonDeclaration {
  return value === "yes" || value === "no";
}

/**
 * Versión vigente según el servidor. Es la única fuente para comparar y para
 * persistir; nunca se usa el texto que manda el cliente.
 */
export function currentUsPersonDeclarationVersion(): string {
  return serverEnv.US_PERSON_DECLARATION_VERSION.trim();
}

/** Igualdad exacta contra la versión del servidor (sólo se recorta el borde). */
export function isCurrentUsPersonDeclarationVersion(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const expected = currentUsPersonDeclarationVersion();
  return expected.length > 0 && value.trim() === expected;
}

export function usPersonDeclarationErrorMessage(reason: DeclarationBlockReason): string {
  if (reason === "us_person") return US_RESIDENT_MESSAGE;
  if (reason === "missing_version") return US_PERSON_VERSION_REQUIRED_MESSAGE;
  if (reason === "version_mismatch") return US_PERSON_VERSION_MISMATCH_MESSAGE;
  return US_PERSON_UNANSWERED_MESSAGE;
}

/**
 * Valida una escritura de perfil/alta sin mirar la fila actual.
 *
 * - `"yes"` siempre bloquea, aunque el resto del cuerpo sea válido.
 * - `"no"` exige versión y que sea exactamente la vigente en el servidor;
 *   sin versión no hay evidencia, y una versión distinta no corresponde al
 *   texto que la persona dice haber leído.
 * - Sin respuesta, sólo se bloquea si el cuerpo intenta completar el
 *   onboarding o escribir una versión. Un PATCH de nombre/moneda sigue
 *   pasando (`not_requested`).
 *
 * `expectedVersion` es sólo para tests (simular un salto de versión sin tocar
 * el entorno): los llamadores de producción deben usar el default.
 */
export function checkUsPersonDeclaration(
  input: {
    usPersonDeclaration?: unknown;
    usPersonDeclarationVersion?: unknown;
    onboardingCompleted?: unknown;
  },
  expectedVersion: string = currentUsPersonDeclarationVersion(),
): DeclarationCheck {
  const declaration = input.usPersonDeclaration;
  const version =
    typeof input.usPersonDeclarationVersion === "string"
      ? input.usPersonDeclarationVersion.trim()
      : "";
  const expected = expectedVersion.trim();

  if (declaration === "yes") return { kind: "blocked", reason: "us_person" };
  if (declaration === "no") {
    if (!version) return { kind: "blocked", reason: "missing_version" };
    if (!expected || version !== expected) return { kind: "blocked", reason: "version_mismatch" };
    return { kind: "declared", declaration: "no", version: expected };
  }

  const requested =
    input.onboardingCompleted === true || input.usPersonDeclarationVersion !== undefined;
  if (requested) return { kind: "blocked", reason: "unanswered" };
  return { kind: "not_requested" };
}
