import { z } from "zod";

import { isResidenceCountry } from "@/app/(platform)/app/onboarding/countries";
import {
  US_PERSON_DECLARATION_VERSION,
  US_PERSON_UNANSWERED_MESSAGE,
  isOperationBlocked,
  type UsPersonDeclaration,
} from "@/config/compliance";
import { site } from "@/config/site";

/** El mismo texto que el paso de país del onboarding cuando el país es EE.UU. */
export const US_RESIDENT_MESSAGE = `${site.name} no está disponible para residentes de Estados Unidos. Si vives en otro país, elige ese país.`;

/** País restringido que no es EE.UU. No lista los países. [REVISIÓN ABOGADO] */
export const BLOCKED_COUNTRY_MESSAGE =
  "No podemos crear la cuenta con el país que indicaste. [REVISIÓN ABOGADO]";

/** El mismo texto que la declaración del onboarding si no la responden. */
export const DECLARATION_REQUIRED = US_PERSON_UNANSWERED_MESSAGE;

/** Checkbox legal obligatorio del registro demo (M43). Mensaje exacto que pide la tarea. */
export const DEMO_LEGAL_MESSAGE =
  "Debes aceptar los Términos y Condiciones y la Política de Privacidad para continuar.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type RegistroValues = {
  email: string;
  password: string;
  passwordConfirm: string;
  nombre: string;
  pais: string;
  nacionalidad: string;
  rut: string;
  fechaNacimiento: string;
  telefono: string;
  /**
   * DB-03: respuesta explícita. `null` = no respondió (bloquea el alta real y
   * la demo); sólo `"no"` se persiste como `is_us_person = false`.
   */
  usPersonDeclaration: UsPersonDeclaration | null;
  terminos: boolean;
  privacidad: boolean;
  riesgos: boolean;
};

export type RegistroVersions = {
  terminos: string;
  privacidad: string;
  riesgos: string;
  /** M75. Opcional: los objetos de versiones que ya existen siguen valiendo. */
  usPersonDeclarationVersion?: string;
};

/** Registro demo mínimo (M43): correo, contraseña y un solo checkbox legal. */
export type RegistroDemoValues = {
  email: string;
  password: string;
  passwordConfirm: string;
  aceptaLegal: boolean;
};

export type RegistroDemoVersions = {
  terminos: string;
  privacidad: string;
};

export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  return compact;
}

export function isInternationalPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}

/** Cuerpo y dígito verificador, sin puntos. Acepta 7 u 8 dígitos y K. */
export function rutParts(value: string): { body: string; dv: string } | null {
  const clean = value.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return null;
  return { body: clean.slice(0, -1), dv: clean.slice(-1) };
}

export function rutVerifier(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  if (rest === 10) return "K";
  return String(rest);
}

export function isValidRut(value: string): boolean {
  const parts = rutParts(value);
  if (!parts) return false;
  return rutVerifier(parts.body) === parts.dv;
}

/** `12.345.678-5`. Si no calza, devuelve el texto recortado. */
export function formatRut(value: string): string {
  const parts = rutParts(value);
  if (!parts) return value.trim();
  const dotted = parts.body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${dotted}-${parts.dv}`;
}

export function isAtLeast18(isoDate: string, today = new Date()): boolean {
  const match = DATE.exec(isoDate.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return false;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 18;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function flagTrue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * DB-03: versión vigente de la declaración según la config compartida.
 * Devuelve `null` si la config no trae una versión usable: sin versión no se
 * puede verificar ninguna evidencia y todo lo que la necesite falla cerrado.
 */
export function configuredUsPersonDeclarationVersion(): string | null {
  const version =
    typeof US_PERSON_DECLARATION_VERSION === "string" ? US_PERSON_DECLARATION_VERSION.trim() : "";
  return version.length > 0 ? version : null;
}

/**
 * DB-03: la versión guardada tiene que ser exactamente la vigente.
 * Una versión arbitraria, vieja o inventada no prueba que la persona haya
 * leído el texto actual. Se recorta el borde, nada más.
 */
export function isCurrentUsPersonDeclarationVersion(
  value: unknown,
  expectedVersion: string | null = configuredUsPersonDeclarationVersion(),
): boolean {
  const expected = expectedVersion?.trim() ?? "";
  if (expected.length === 0) return false;
  return text(value) === expected;
}

/**
 * DB-03: prueba de una declaración U.S. person guardada por el servidor.
 *
 * No basta `is_us_person = false`: la columna nace con ese default y un perfil
 * viejo (o un alta que saltó la UI) nunca respondió. Se exigen:
 * - haber respondido explícitamente "no" (`is_us_person === false`),
 * - la versión vigente del texto (no cualquier texto no vacío),
 * - la fecha del servidor, parseable como instante ISO.
 *
 * `expectedVersion` permite fijar la fuente de verdad del servidor (env
 * validado en el middleware/guards). Sin versión esperada → `false`.
 */
export function usPersonDeclarationVerified(
  record: Record<string, unknown> | null,
  expectedVersion: string | null = configuredUsPersonDeclarationVersion(),
): boolean {
  if (!record) return false;
  const declaredAt = text(record.us_person_declared_at);
  if (declaredAt.length === 0 || !Number.isFinite(Date.parse(declaredAt))) return false;
  return (
    record.is_us_person === false &&
    isCurrentUsPersonDeclarationVersion(record.us_person_declaration_version, expectedVersion)
  );
}

/** Datos del perfil, sin mirar el correo. Lo usan el formulario y el JWT. */
export function perfilListo(
  input: {
    nombre: string;
    pais: string;
    rut: string;
    fechaNacimiento: string;
    telefono: string;
    /** DB-03: sólo `false` (respuesta "no") cuenta como perfil listo. */
    isUsPerson: boolean | null;
    termsVersion: string;
    privacyVersion: string;
    risksVersion: string;
    /** Si viene y está bloqueada, el perfil no está listo. No es obligatoria: los JWT viejos no la traen. */
    nationalityCountry?: string | null;
  },
  today = new Date(),
): boolean {
  const pais = input.pais.trim().toUpperCase();
  const nationality = (input.nationalityCountry ?? "").trim().toUpperCase();
  if (!input.nombre.trim() || input.nombre.trim().length > 80) return false;
  if (!/^[A-Z]{2}$/.test(pais) || isOperationBlocked(pais) || input.isUsPerson !== false) return false;
  if (nationality && (!/^[A-Z]{2}$/.test(nationality) || isOperationBlocked(nationality))) return false;
  if (!isAtLeast18(input.fechaNacimiento, today)) return false;
  if (!isInternationalPhone(input.telefono)) return false;
  if (pais === "CL" && !isValidRut(input.rut)) return false;
  if (!input.termsVersion.trim() || !input.privacyVersion.trim() || !input.risksVersion.trim()) return false;
  return true;
}

function recordOf(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  return meta as Record<string, unknown>;
}

function onboardedRecord(record: Record<string, unknown> | null, today: Date): boolean {
  if (!record) return false;
  if (!flagTrue(record.onboarding_completed)) return false;
  const nacimiento = text(record.fecha_nacimiento).slice(0, 10);
  return perfilListo(
    {
      nombre: text(record.nombre),
      pais: text(record.pais),
      rut: text(record.rut),
      fechaNacimiento: nacimiento,
      telefono: text(record.telefono),
      isUsPerson:
        record.is_us_person === true ? true : record.is_us_person === false ? false : null,
      termsVersion: text(record.terms_version),
      privacyVersion: text(record.privacy_version),
      risksVersion: text(record.risks_version),
      nationalityCountry: text(record.nationality_country),
    },
    today,
  );
}

export function claimsOnboarded(
  claims: { user_metadata?: unknown } | null | undefined,
  today = new Date(),
): boolean {
  return onboardedRecord(recordOf(claims?.user_metadata), today);
}

/**
 * Autorización del gate (SEC-07). Sólo `app_metadata` (lo escribe el
 * servidor). `user_metadata` no cuenta: el usuario puede cambiarlo solo.
 *
 * `expectedDeclarationVersion` es la versión vigente según el servidor
 * (`serverEnv` en el middleware). Sin ella se usa la config compartida; si
 * tampoco hay versión, la declaración no se puede verificar.
 */
export function gateFromAppMetadata(
  claims: unknown,
  today = new Date(),
  expectedDeclarationVersion: string | null = configuredUsPersonDeclarationVersion(),
): { onboarded: boolean; demoReady: boolean } {
  const app =
    claims && typeof claims === "object" ? (claims as { app_metadata?: unknown }).app_metadata : undefined;
  const record = recordOf(app);
  // DB-03: el onboarding real exige la declaración verificada contra la
  // versión vigente. Un `is_us_person=false` heredado, una versión arbitraria
  // o una fecha que no es un instante no autorizan.
  const onboarded =
    onboardedRecord(record, today) &&
    usPersonDeclarationVerified(record, expectedDeclarationVersion);
  const demoReady =
    onboarded ||
    Boolean(
      record &&
        record.is_us_person !== true &&
        text(record.terms_version) &&
        text(record.privacy_version),
    );
  return { onboarded, demoReady };
}

/**
 * Misma decisión con filas del servidor (`consents` / `profiles`).
 * La aceptación demo son `terminos` + `privacidad`. El onboarding real exige
 * perfil completo (`onboarding_completed`) y declaración U.S. person
 * verificada: `is_us_person = false`, la versión vigente y la fecha del
 * servidor. Una versión arbitraria o vieja no autoriza (DB-03).
 * Un "sí" explícito no entra ni a la demo.
 *
 * `expectedDeclarationVersion` sale de `serverEnv` en el middleware; si falta,
 * la declaración no se verifica (fail-closed).
 */
export function gateFromComplianceRows(
  input: {
    consents: readonly { doc?: unknown; version?: unknown }[];
    onboardingCompleted: boolean;
    isUsPerson?: boolean | null;
    usPersonDeclarationVersion?: string | null;
    usPersonDeclaredAt?: string | null;
  },
  expectedDeclarationVersion: string | null = configuredUsPersonDeclarationVersion(),
): { onboarded: boolean; demoReady: boolean } {
  const docs = new Set<string>();
  for (const row of input.consents) {
    if (typeof row.doc !== "string" || typeof row.version !== "string") continue;
    if (row.version.trim() === "") continue;
    docs.add(row.doc);
  }
  const declared = usPersonDeclarationVerified(
    {
      is_us_person: input.isUsPerson ?? null,
      us_person_declaration_version: input.usPersonDeclarationVersion ?? null,
      us_person_declared_at: input.usPersonDeclaredAt ?? null,
    },
    expectedDeclarationVersion,
  );
  const onboarded = input.onboardingCompleted === true && declared;
  const demoReady = onboarded || (docs.has("terminos") && docs.has("privacidad") && input.isUsPerson !== true);
  return { onboarded, demoReady };
}

export function registroUserData(
  input: Pick<
    RegistroValues,
    "nombre" | "rut" | "pais" | "fechaNacimiento" | "telefono" | "usPersonDeclaration"
  > & {
    nacionalidad?: string;
  },
  versions: RegistroVersions,
) {
  if (input.usPersonDeclaration !== "no") {
    throw new Error("US_PERSON_DECLARATION_REQUIRED");
  }
  const pais = input.pais.trim().toUpperCase();
  const nationality = (input.nacionalidad ?? "").trim().toUpperCase();
  return {
    nombre: input.nombre.trim(),
    rut: pais === "CL" ? formatRut(input.rut) : null,
    pais,
    fecha_nacimiento: input.fechaNacimiento.trim(),
    telefono: normalizePhone(input.telefono),
    // DB-03: `false` sólo se deriva de una respuesta explícita "no".
    // `us_person_declared_at` lo escribe el servidor (trigger/RPC), no el cliente.
    is_us_person: false,
    residence_country: pais,
    nationality_country: /^[A-Z]{2}$/.test(nationality) ? nationality : null,
    us_person_declaration_version:
      versions.usPersonDeclarationVersion?.trim() || US_PERSON_DECLARATION_VERSION,
    terms_version: versions.terminos,
    privacy_version: versions.privacidad,
    risks_version: versions.riesgos,
    onboarding_completed: true,
  };
}

/** `user_metadata` mínimo del alta demo (M43): sólo versiones, fecha ISO y origen. */
export function registroDemoUserData(
  versions: RegistroDemoVersions,
  acceptedAtIso: string,
): {
  terms_version: string;
  privacy_version: string;
  terms_accepted_at: string;
  signup_source: "demo";
} {
  return {
    terms_version: versions.terminos,
    privacy_version: versions.privacidad,
    terms_accepted_at: acceptedAtIso,
    signup_source: "demo",
  };
}

/**
 * Pista de UI (login y ficha). No autoriza el gate: ese usa
 * `gateFromAppMetadata` y `gateFromComplianceRows`.
 * Demo lista (M43): tiene `terms_version` y `privacy_version`.
 * Los usuarios antiguos con el perfil completo (`onboarding_completed`)
 * también se tratan como listos, aunque no traigan esas versiones.
 */
export function claimsDemoReady(
  claims: { user_metadata?: unknown } | null | undefined,
  today = new Date(),
): boolean {
  const meta = claims?.user_metadata;
  if (!meta || typeof meta !== "object") return false;
  const record = meta as Record<string, unknown>;
  if (text(record.terms_version) && text(record.privacy_version)) return true;
  return claimsOnboarded(claims, today);
}

function checkAccount(data: RegistroValues, ctx: z.RefinementCtx): void {
  if (data.password !== data.passwordConfirm) {
    ctx.addIssue({ code: "custom", path: ["passwordConfirm"], message: "Las contraseñas no coinciden." });
  }
}

function blockedCountryMessage(code: string): string {
  return code === "US" ? US_RESIDENT_MESSAGE : BLOCKED_COUNTRY_MESSAGE;
}

function checkDatos(data: RegistroValues, ctx: z.RefinementCtx, today: Date): void {
  const pais = data.pais.trim().toUpperCase();
  const nacionalidad = data.nacionalidad.trim().toUpperCase();
  if (isOperationBlocked(pais)) {
    ctx.addIssue({ code: "custom", path: ["pais"], message: blockedCountryMessage(pais) });
  }
  if (isOperationBlocked(nacionalidad)) {
    ctx.addIssue({ code: "custom", path: ["nacionalidad"], message: blockedCountryMessage(nacionalidad) });
  }
  // DB-03: `yes` bloquea. `null` (o ausente) es "no respondió" y también
  // bloquea: nunca se completa el alta derivando `false` de un default.
  if (data.usPersonDeclaration === "yes") {
    ctx.addIssue({ code: "custom", path: ["usPersonDeclaration"], message: US_RESIDENT_MESSAGE });
  } else if (data.usPersonDeclaration !== "no") {
    ctx.addIssue({ code: "custom", path: ["usPersonDeclaration"], message: DECLARATION_REQUIRED });
  }
  if (pais === "CL" && !isValidRut(data.rut)) {
    ctx.addIssue({ code: "custom", path: ["rut"], message: "Ingresa un RUT válido, como 12.345.678-5." });
  }
  if (!isAtLeast18(data.fechaNacimiento, today)) {
    ctx.addIssue({ code: "custom", path: ["fechaNacimiento"], message: "Tienes que ser mayor de 18 años." });
  }
  if (!isInternationalPhone(data.telefono)) {
    ctx.addIssue({
      code: "custom",
      path: ["telefono"],
      message: "Usa un teléfono con código de país, como +56912345678.",
    });
  }
  if (!data.terminos) ctx.addIssue({ code: "custom", path: ["terminos"], message: "Acepta los términos y condiciones." });
  if (!data.privacidad) ctx.addIssue({ code: "custom", path: ["privacidad"], message: "Acepta la política de privacidad." });
  if (!data.riesgos) ctx.addIssue({ code: "custom", path: ["riesgos"], message: "Acepta la divulgación de riesgos." });
}

/** `account` en falso omite correo y contraseña: sirve para completar datos ya con sesión. */
export function registroSchemaAt(today: Date, account: boolean) {
  return z
    .object({
      email: account
        ? z.string().trim().regex(EMAIL, "Ingresa un correo válido.")
        : z.string(),
      password: account
        ? z.string().min(8, "Usa al menos 8 caracteres; te recomendamos 12 o más con letras y números.")
        : z.string(),
      passwordConfirm: z.string(),
      nombre: z.string().trim().min(1, "Ingresa tu nombre completo.").max(80, "El nombre es muy largo."),
      pais: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, "Elige tu país de residencia.")
        .refine(isResidenceCountry, "Elige tu país de residencia."),
      nacionalidad: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, "Elige tu nacionalidad.")
        .refine(isResidenceCountry, "Elige tu nacionalidad."),
      rut: z.string(),
      fechaNacimiento: z.string(),
      telefono: z.string(),
      usPersonDeclaration: z.enum(["yes", "no"]).nullable(),
      terminos: z.boolean(),
      privacidad: z.boolean(),
      riesgos: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (account) checkAccount(data, ctx);
      checkDatos(data, ctx, today);
    });
}

/**
 * Esquema del registro demo (M43): correo, contraseña (mín. 8),
 * repetición igual y un solo checkbox legal obligatorio.
 */
export function registroDemoSchema() {
  return z
    .object({
      email: z.string().trim().regex(EMAIL, "Ingresa un correo válido."),
      password: z.string().min(8, "Usa al menos 8 caracteres; te recomendamos 12 o más con letras y números."),
      passwordConfirm: z.string(),
      aceptaLegal: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.passwordConfirm) {
        ctx.addIssue({ code: "custom", path: ["passwordConfirm"], message: "Las contraseñas no coinciden." });
      }
      if (!data.aceptaLegal) {
        ctx.addIssue({ code: "custom", path: ["aceptaLegal"], message: DEMO_LEGAL_MESSAGE });
      }
    });
}
