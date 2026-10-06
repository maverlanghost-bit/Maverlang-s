import "server-only";

import { z } from "zod";

import { DomainError } from "@/lib/api/result";
import { US_RESIDENT_MESSAGE, formatRut, isValidRut, normalizePhone } from "@/lib/auth/registro-schema";
import { PROFILE_MIGRATION_MESSAGE } from "@/lib/profile/migration";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/schema-error";
import type { Consent, LegalDoc, Preferences, UserProfile } from "@/lib/types";

/**
 * Perfil con la sesión del usuario (RLS). No usa la clave de servidor.
 * Cartera, órdenes y billetera no pasan por acá.
 */

const PROFILE_COLUMNS =
  "id,email,nombre,rut,pais,fecha_nacimiento,telefono,is_us_person,onboarding_completed,language,display_currency,created_at";

const profileRowSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  nombre: z.string().nullable(),
  rut: z.string().nullable(),
  pais: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
  telefono: z.string().nullable(),
  is_us_person: z.boolean().nullable(),
  onboarding_completed: z.boolean(),
  language: z.string(),
  display_currency: z.string(),
  created_at: z.string().min(1),
});

const preferenceRowSchema = z.object({
  user_id: z.string().min(1),
  notify_orders: z.boolean(),
  notify_deposits: z.boolean(),
  notify_news: z.boolean(),
});

const consentRowSchema = z.object({
  user_id: z.string().min(1),
  doc: z.enum(["terminos", "privacidad", "riesgos"]),
  version: z.string().min(1),
  accepted_at: z.string().min(1),
});

type ProfileRow = z.infer<typeof profileRowSchema>;
type DbError = { code?: string; message?: string };

const DEFAULT_NOTIFY = {
  notifyOrders: true,
  notifyDeposits: true,
  notifyNews: false,
} as const;

function throwDb(error: DbError): never {
  if (isMissingSchemaError(error)) throw new DomainError("INTERNAL", PROFILE_MIGRATION_MESSAGE);
  if (error.code === "42501") throw new DomainError("VALIDATION", US_RESIDENT_MESSAGE);
  if (error.code === "23514" || error.code === "23505" || error.code === "23503") {
    throw new DomainError("VALIDATION", "Los datos no son válidos.");
  }
  throw new DomainError("UPSTREAM", "Supabase no respondió.");
}

function asLanguage(value: string): UserProfile["language"] {
  return value === "en" ? "en" : "es-CL";
}

function asCurrency(value: string): UserProfile["displayCurrency"] {
  return value === "USD" ? "USD" : "CLP";
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function toProfile(row: ProfileRow): UserProfile {
  const country = row.pais?.trim().toUpperCase() || null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.nombre?.trim() || null,
    country: country && country.length === 2 ? country : null,
    isUsPerson: row.is_us_person,
    walletAddress: null,
    onboardingCompleted: row.onboarding_completed,
    language: asLanguage(row.language),
    displayCurrency: asCurrency(row.display_currency),
    createdAt: row.created_at,
    rut: row.rut,
    birthDate: dateOnly(row.fecha_nacimiento),
    phone: row.telefono,
  };
}

async function sessionClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new DomainError("INTERNAL", "Falta la configuración de Supabase.");
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) throw new DomainError("UNAUTHORIZED");
  return { supabase, userId: data.claims.sub };
}

function sameUser(id: string, userId: string): void {
  if (id !== userId) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
}

async function readRow(id: string): Promise<{ profile: UserProfile; userId: string; supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"] }> {
  const { supabase, userId } = await sessionClient();
  sameUser(id, userId);
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throwDb(error);
  const parsed = profileRowSchema.safeParse(data);
  if (!parsed.success) throw new DomainError("NOT_FOUND", "No encontramos tu perfil.");
  return { profile: toProfile(parsed.data), userId, supabase };
}

function defaults(profile: Pick<UserProfile, "language" | "displayCurrency">): Preferences {
  return { ...DEFAULT_NOTIFY, language: profile.language, displayCurrency: profile.displayCurrency };
}

export const rlsUsers = {
  async get(id: string): Promise<UserProfile> {
    const { profile } = await readRow(id);
    return profile;
  },

  async update(id: string, patch: Partial<UserProfile>): Promise<UserProfile> {
    const { profile, supabase, userId } = await readRow(id);
    const country = patch.country === undefined ? profile.country : patch.country?.trim().toUpperCase() || null;
    const isUsPerson = patch.isUsPerson === undefined ? profile.isUsPerson : patch.isUsPerson;
    if (country === "US" || isUsPerson === true) throw new DomainError("VALIDATION", US_RESIDENT_MESSAGE);

    const body: Record<string, unknown> = {};
    if (patch.displayName !== undefined) body.nombre = patch.displayName?.trim() || null;
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.country !== undefined) body.pais = country;
    if (patch.isUsPerson !== undefined) body.is_us_person = isUsPerson;
    if (patch.onboardingCompleted !== undefined) body.onboarding_completed = patch.onboardingCompleted;
    if (patch.language !== undefined) body.language = patch.language;
    if (patch.displayCurrency !== undefined) body.display_currency = patch.displayCurrency;
    if (patch.birthDate !== undefined) body.fecha_nacimiento = patch.birthDate;
    if (patch.phone !== undefined) body.telefono = patch.phone ? normalizePhone(patch.phone) : null;

    const nextCountry = country;
    if (patch.rut !== undefined || (patch.country !== undefined && nextCountry !== "CL")) {
      if (nextCountry !== "CL") body.rut = null;
      else if (patch.rut) {
        if (!isValidRut(patch.rut)) throw new DomainError("VALIDATION", "Ingresa un RUT válido, como 12.345.678-5.");
        body.rut = formatRut(patch.rut);
      } else body.rut = null;
    }

    if (Object.keys(body).length === 0) return profile;
    const { data, error } = await supabase
      .from("profiles")
      .update(body)
      .eq("id", userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) throwDb(error);
    const parsed = profileRowSchema.safeParse(data);
    if (!parsed.success) throw new DomainError("NOT_FOUND", "No encontramos tu perfil.");
    return toProfile(parsed.data);
  },

  async addConsent(row: Consent): Promise<Consent> {
    const { supabase, userId } = await sessionClient();
    sameUser(row.userId, userId);
    if (row.version.trim() === "") throw new DomainError("VALIDATION", "Falta la versión del documento.");
    const acceptedAt = row.acceptedAt || new Date().toISOString();
    const inserted = await supabase
      .from("consents")
      .insert({ user_id: userId, doc: row.doc, version: row.version, accepted_at: acceptedAt })
      .select("user_id,doc,version,accepted_at")
      .maybeSingle();
    if (inserted.error && inserted.error.code !== "23505") throwDb(inserted.error);
    if (!inserted.error && inserted.data) return toConsent(consentRowSchema.parse(inserted.data));
    const existing = await supabase
      .from("consents")
      .select("user_id,doc,version,accepted_at")
      .eq("user_id", userId)
      .eq("doc", row.doc)
      .eq("version", row.version)
      .maybeSingle();
    if (existing.error) throwDb(existing.error);
    const parsed = consentRowSchema.safeParse(existing.data);
    if (!parsed.success) throw new DomainError("INTERNAL");
    return toConsent(parsed.data);
  },

  async listConsents(id: string): Promise<Consent[]> {
    const { supabase, userId } = await sessionClient();
    sameUser(id, userId);
    const { data, error } = await supabase
      .from("consents")
      .select("user_id,doc,version,accepted_at")
      .eq("user_id", userId)
      .order("accepted_at", { ascending: false });
    if (error) throwDb(error);
    return (data ?? []).map((item) => {
      const parsed = consentRowSchema.safeParse(item);
      if (!parsed.success) throw new DomainError("INTERNAL");
      return toConsent(parsed.data);
    });
  },

  async deletionStatus(): Promise<{ requestedAt: string | null }> {
    return { requestedAt: null };
  },

  async requestDeletion(): Promise<{ requestedAt: string }> {
    throw new DomainError("VALIDATION", "La baja de la cuenta todavía no está disponible.");
  },

  async prefs(id: string): Promise<Preferences> {
    try {
      const { profile, supabase, userId } = await readRow(id);
      const { data, error } = await supabase
        .from("preferences")
        .select("user_id,notify_orders,notify_deposits,notify_news")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        if (isMissingSchemaError(error)) return defaults(profile);
        throwDb(error);
      }
      if (!data) return defaults(profile);
      const parsed = preferenceRowSchema.safeParse(data);
      if (!parsed.success) throw new DomainError("INTERNAL");
      return {
        notifyOrders: parsed.data.notify_orders,
        notifyDeposits: parsed.data.notify_deposits,
        notifyNews: parsed.data.notify_news,
        language: profile.language,
        displayCurrency: profile.displayCurrency,
      };
    } catch (error) {
      if (error instanceof DomainError && error.message === PROFILE_MIGRATION_MESSAGE) {
        return { ...DEFAULT_NOTIFY, language: "es-CL", displayCurrency: "CLP" };
      }
      throw error;
    }
  },

  async setPrefs(id: string, prefs: Preferences): Promise<Preferences> {
    const { supabase, userId } = await readRow(id);
    const profileWrite = await supabase
      .from("profiles")
      .update({ language: prefs.language, display_currency: prefs.displayCurrency })
      .eq("id", userId);
    if (profileWrite.error) throwDb(profileWrite.error);
    const { error } = await supabase.from("preferences").upsert(
      {
        user_id: userId,
        notify_orders: prefs.notifyOrders,
        notify_deposits: prefs.notifyDeposits,
        notify_news: prefs.notifyNews,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (isMissingSchemaError(error)) {
        return prefs;
      }
      throwDb(error);
    }
    return prefs;
  },
};

function toConsent(row: z.infer<typeof consentRowSchema>): Consent {
  const doc: LegalDoc = row.doc;
  return { userId: row.user_id, doc, version: row.version, acceptedAt: row.accepted_at };
}
