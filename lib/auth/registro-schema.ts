import { z } from "zod";

import { site } from "@/config/site";
import { isResidenceCountry } from "@/app/(platform)/app/onboarding/countries";

/** El mismo texto que el paso de país del onboarding. */
export const US_RESIDENT_MESSAGE = `${site.name} no está disponible para residentes de Estados Unidos. Si vives en otro país, elige ese país.`;

/** El mismo texto que la declaración del onboarding si no la marcan. */
export const DECLARATION_REQUIRED = "Confirma que no eres ciudadano ni residente de EE.UU.";

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
  rut: string;
  fechaNacimiento: string;
  telefono: string;
  notUsPerson: boolean;
  terminos: boolean;
  privacidad: boolean;
  riesgos: boolean;
};

export type RegistroVersions = {
  terminos: string;
  privacidad: string;
  riesgos: string;
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

/** Datos del perfil, sin mirar el correo. Lo usan el formulario y el JWT. */
export function perfilListo(
  input: {
    nombre: string;
    pais: string;
    rut: string;
    fechaNacimiento: string;
    telefono: string;
    isUsPerson: boolean;
    termsVersion: string;
    privacyVersion: string;
    risksVersion: string;
  },
  today = new Date(),
): boolean {
  const pais = input.pais.trim().toUpperCase();
  if (!input.nombre.trim() || input.nombre.trim().length > 80) return false;
  if (!/^[A-Z]{2}$/.test(pais) || pais === "US" || input.isUsPerson) return false;
  if (!isAtLeast18(input.fechaNacimiento, today)) return false;
  if (!isInternationalPhone(input.telefono)) return false;
  if (pais === "CL" && !isValidRut(input.rut)) return false;
  if (!input.termsVersion.trim() || !input.privacyVersion.trim() || !input.risksVersion.trim()) return false;
  return true;
}

export function claimsOnboarded(
  claims: { user_metadata?: unknown } | null | undefined,
  today = new Date(),
): boolean {
  const meta = claims?.user_metadata;
  if (!meta || typeof meta !== "object") return false;
  const record = meta as Record<string, unknown>;
  if (!flagTrue(record.onboarding_completed)) return false;
  const nacimiento = text(record.fecha_nacimiento).slice(0, 10);
  return perfilListo(
    {
      nombre: text(record.nombre),
      pais: text(record.pais),
      rut: text(record.rut),
      fechaNacimiento: nacimiento,
      telefono: text(record.telefono),
      isUsPerson: flagTrue(record.is_us_person),
      termsVersion: text(record.terms_version),
      privacyVersion: text(record.privacy_version),
      risksVersion: text(record.risks_version),
    },
    today,
  );
}

export function registroUserData(input: Pick<RegistroValues, "nombre" | "rut" | "pais" | "fechaNacimiento" | "telefono">, versions: RegistroVersions) {
  const pais = input.pais.trim().toUpperCase();
  return {
    nombre: input.nombre.trim(),
    rut: pais === "CL" ? formatRut(input.rut) : null,
    pais,
    fecha_nacimiento: input.fechaNacimiento.trim(),
    telefono: normalizePhone(input.telefono),
    is_us_person: false,
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
 * Demo lista (M43): tiene `terms_version` y `privacy_version`.
 * Los usuarios antiguos con el perfil completo (`onboarding_completed`)
 * también entran, aunque no traigan esas versiones.
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

function checkDatos(data: RegistroValues, ctx: z.RefinementCtx, today: Date): void {
  const pais = data.pais.trim().toUpperCase();
  if (pais === "US") {
    ctx.addIssue({ code: "custom", path: ["pais"], message: US_RESIDENT_MESSAGE });
  }
  if (!data.notUsPerson) {
    ctx.addIssue({ code: "custom", path: ["notUsPerson"], message: DECLARATION_REQUIRED });
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
        ? z.string().min(8, "La contraseña debe tener al menos 8 caracteres.")
        : z.string(),
      passwordConfirm: z.string(),
      nombre: z.string().trim().min(1, "Ingresa tu nombre completo.").max(80, "El nombre es muy largo."),
      pais: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, "Elige tu país de residencia.")
        .refine(isResidenceCountry, "Elige tu país de residencia."),
      rut: z.string(),
      fechaNacimiento: z.string(),
      telefono: z.string(),
      notUsPerson: z.boolean(),
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
      password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
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
