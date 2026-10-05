import "server-only";

import type { Consent, Preferences, UserProfile } from "@/lib/types";

/**
 * TODO: CRUD con la service role de Supabase (ARQUITECTURA §9 y §10).
 * Tablas: profiles, consents, preferences. RLS sin políticas públicas.
 * La identidad es el DID de Privy, no Supabase Auth. Nunca exponer SUPABASE_SERVICE_ROLE_KEY.
 */
export const supabaseUsers = {
  async get(): Promise<UserProfile> {
    throw new Error("NOT_IMPLEMENTED: Supabase profiles");
  },
  async update(): Promise<UserProfile> {
    throw new Error("NOT_IMPLEMENTED: Supabase profiles");
  },
  async addConsent(): Promise<Consent> {
    throw new Error("NOT_IMPLEMENTED: Supabase consents");
  },
  async prefs(): Promise<Preferences> {
    throw new Error("NOT_IMPLEMENTED: Supabase preferences");
  },
  async setPrefs(): Promise<Preferences> {
    throw new Error("NOT_IMPLEMENTED: Supabase preferences");
  },
};
