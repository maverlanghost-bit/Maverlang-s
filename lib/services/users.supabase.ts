import "server-only";

import { z } from "zod";

import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import type { Consent, LegalDoc, Preferences, UserProfile } from "@/lib/types";

/**
 * CRUD de perfiles con la service role (ARQUITECTURA §9 y §10).
 * Las queries de abajo sólo corren si `DATA_MODE=live`. En mock, `getServices()`
 * ni las llama; igual el guard de cada método corta antes del fetch.
 * RLS está activo y sin políticas públicas. La identidad es el DID de Privy.
 * `language` y `display_currency` viven en `profiles`. Las notificaciones, en `preferences`.
 * La baja no tiene columna en `0001_init.sql`: se anota en `audit_log` y no borra la fila.
 */

const DELETION_ACTION = "account_deletion_requested";

const PROFILE_SELECT =
  "id,email,display_name,country,is_us_person,wallet_address,onboarding_completed,language,display_currency,created_at";

const profileRowSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  country: z.string().nullable(),
  is_us_person: z.boolean().nullable(),
  wallet_address: z.string().nullable(),
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

const deletionRowSchema = z.object({
  created_at: z.string().min(1),
});

type ProfileRow = z.infer<typeof profileRowSchema>;

type RestInit = {
  method?: "GET" | "POST" | "PATCH";
  query?: string;
  body?: unknown;
  prefer?: string;
};

function assertLive(): { url: string; key: string } {
  if (serverEnv.DATA_MODE !== "live") {
    throw new Error("NOT_IMPLEMENTED: Supabase sólo con DATA_MODE=live");
  }
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new DomainError("INTERNAL", "Falta la configuración de Supabase.");
  }
  return { url, key };
}

function eq(column: string, value: string): string {
  return `${column}=eq.${encodeURIComponent(value)}`;
}

function pgCode(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("code" in body)) return null;
  const code = (body as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

function fail(status: number, body: unknown): never {
  const code = pgCode(body);
  if (code === "23503") throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  if (code === "23505") throw new DomainError("VALIDATION", "Ese registro ya existe.");
  if (code === "23514" || status === 400) throw new DomainError("VALIDATION");
  if (status === 401 || status === 403) throw new DomainError("INTERNAL");
  if (status >= 500) throw new DomainError("UPSTREAM", "Supabase no respondió.");
  throw new DomainError("INTERNAL");
}

async function rest(path: string, init: RestInit = {}): Promise<unknown> {
  const { url, key } = assertLive();
  const query = init.query ? `?${init.query}` : "";
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}${query}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new DomainError("UPSTREAM", "Supabase no respondió.");
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new DomainError("UPSTREAM", "Supabase devolvió una respuesta inválida.");
    }
  }
  if (!response.ok) fail(response.status, body);
  return body;
}

function asRows(body: unknown): unknown[] {
  if (!Array.isArray(body)) throw new DomainError("UPSTREAM", "Supabase devolvió una respuesta inválida.");
  return body;
}

function asLanguage(value: string): UserProfile["language"] {
  if (value === "es-CL" || value === "en") return value;
  throw new DomainError("INTERNAL");
}

function asCurrency(value: string): UserProfile["displayCurrency"] {
  if (value === "CLP" || value === "USD") return value;
  throw new DomainError("INTERNAL");
}

function toProfile(row: ProfileRow): UserProfile {
  const country = row.country?.trim() ?? null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    country: country ? country : null,
    isUsPerson: row.is_us_person,
    walletAddress: row.wallet_address,
    onboardingCompleted: row.onboarding_completed,
    language: asLanguage(row.language),
    displayCurrency: asCurrency(row.display_currency),
    createdAt: row.created_at,
  };
}

function parseProfile(body: unknown): ProfileRow | null {
  const rows = asRows(body);
  if (rows.length === 0) return null;
  const parsed = profileRowSchema.safeParse(rows[0]);
  if (!parsed.success) throw new DomainError("INTERNAL");
  return parsed.data;
}

async function readProfile(id: string): Promise<UserProfile> {
  const body = await rest("profiles", { query: `${eq("id", id)}&select=${PROFILE_SELECT}` });
  const row = parseProfile(body);
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  return toProfile(row);
}

function profilePatch(patch: Partial<UserProfile>): Record<string, unknown> {
  const column: Partial<Record<keyof UserProfile, string>> = {
    email: "email",
    displayName: "display_name",
    country: "country",
    isUsPerson: "is_us_person",
    walletAddress: "wallet_address",
    onboardingCompleted: "onboarding_completed",
    language: "language",
    displayCurrency: "display_currency",
  };
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(column) as (keyof UserProfile)[]) {
    if (patch[key] === undefined) continue;
    const name = column[key];
    if (!name) continue;
    body[name] = patch[key];
  }
  if (Object.keys(body).length > 0) body.updated_at = new Date().toISOString();
  return body;
}

export const supabaseUsers = {
  async get(id: string): Promise<UserProfile> {
    return readProfile(id);
  },

  async update(id: string, patch: Partial<UserProfile>): Promise<UserProfile> {
    const body = profilePatch(patch);
    if (Object.keys(body).length === 0) return readProfile(id);
    const written = await rest("profiles", {
      method: "PATCH",
      query: `${eq("id", id)}&select=${PROFILE_SELECT}`,
      prefer: "return=representation",
      body,
    });
    const row = parseProfile(written);
    if (!row) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
    return toProfile(row);
  },

  async addConsent(row: Consent): Promise<Consent> {
    await readProfile(row.userId);
    if (row.version.trim() === "") {
      throw new DomainError("VALIDATION", "Falta la versión del documento.");
    }
    const acceptedAt = row.acceptedAt || new Date().toISOString();
    const written = await rest("consents", {
      method: "POST",
      query: "on_conflict=user_id,doc,version&select=user_id,doc,version,accepted_at",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        user_id: row.userId,
        doc: row.doc,
        version: row.version,
        accepted_at: acceptedAt,
      },
    });
    const saved = consentRowSchema.safeParse(asRows(written)[0]);
    if (!saved.success) throw new DomainError("INTERNAL");
    return toConsent(saved.data);
  },

  async listConsents(id: string): Promise<Consent[]> {
    await readProfile(id);
    const body = await rest("consents", {
      query: `${eq("user_id", id)}&select=user_id,doc,version,accepted_at&order=accepted_at.desc`,
    });
    return asRows(body).map((item) => {
      const parsed = consentRowSchema.safeParse(item);
      if (!parsed.success) throw new DomainError("INTERNAL");
      return toConsent(parsed.data);
    });
  },

  async deletionStatus(id: string): Promise<{ requestedAt: string | null }> {
    await readProfile(id);
    return { requestedAt: await firstDeletion(id) };
  },

  async requestDeletion(id: string): Promise<{ requestedAt: string }> {
    await readProfile(id);
    const existing = await firstDeletion(id);
    if (existing) return { requestedAt: existing };
    const written = await rest("audit_log", {
      method: "POST",
      query: "select=created_at",
      prefer: "return=representation",
      body: {
        user_id: id,
        action: DELETION_ACTION,
        meta: { source: "app" },
      },
    });
    const parsed = deletionRowSchema.safeParse(asRows(written)[0]);
    if (!parsed.success) throw new DomainError("INTERNAL");
    return { requestedAt: parsed.data.created_at };
  },

  async prefs(id: string): Promise<Preferences> {
    const profile = await readProfile(id);
    const body = await rest("preferences", {
      query: `${eq("user_id", id)}&select=user_id,notify_orders,notify_deposits,notify_news`,
    });
    const rows = asRows(body);
    if (rows.length === 0) {
      return {
        notifyOrders: true,
        notifyDeposits: true,
        notifyNews: false,
        language: profile.language,
        displayCurrency: profile.displayCurrency,
      };
    }
    const parsed = preferenceRowSchema.safeParse(rows[0]);
    if (!parsed.success) throw new DomainError("INTERNAL");
    return {
      notifyOrders: parsed.data.notify_orders,
      notifyDeposits: parsed.data.notify_deposits,
      notifyNews: parsed.data.notify_news,
      language: profile.language,
      displayCurrency: profile.displayCurrency,
    };
  },

  async setPrefs(id: string, prefs: Preferences): Promise<Preferences> {
    await readProfile(id);
    const written = await rest("preferences", {
      method: "POST",
      query: "on_conflict=user_id&select=user_id,notify_orders,notify_deposits,notify_news",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        user_id: id,
        notify_orders: prefs.notifyOrders,
        notify_deposits: prefs.notifyDeposits,
        notify_news: prefs.notifyNews,
        updated_at: new Date().toISOString(),
      },
    });
    const parsed = preferenceRowSchema.safeParse(asRows(written)[0]);
    if (!parsed.success) throw new DomainError("INTERNAL");
    await rest("profiles", {
      method: "PATCH",
      query: eq("id", id),
      prefer: "return=minimal",
      body: {
        language: prefs.language,
        display_currency: prefs.displayCurrency,
      },
    });
    return {
      notifyOrders: parsed.data.notify_orders,
      notifyDeposits: parsed.data.notify_deposits,
      notifyNews: parsed.data.notify_news,
      language: prefs.language,
      displayCurrency: prefs.displayCurrency,
    };
  },
};

function toConsent(row: z.infer<typeof consentRowSchema>): Consent {
  const doc: LegalDoc = row.doc;
  return {
    userId: row.user_id,
    doc,
    version: row.version,
    acceptedAt: row.accepted_at,
  };
}

async function firstDeletion(id: string): Promise<string | null> {
  const body = await rest("audit_log", {
    query: `${eq("user_id", id)}&${eq("action", DELETION_ACTION)}&select=created_at&order=created_at.asc&limit=1`,
  });
  const rows = asRows(body);
  if (rows.length === 0) return null;
  const parsed = deletionRowSchema.safeParse(rows[0]);
  if (!parsed.success) throw new DomainError("INTERNAL");
  return parsed.data.created_at;
}
