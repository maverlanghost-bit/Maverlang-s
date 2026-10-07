import "server-only";

import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readSupabaseSecretKey } from "@/lib/supabase/secret";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import { WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist/message";

export { WAITLIST_SUCCESS_MESSAGE };

/**
 * Lista de espera de la cuenta Real (M45). Sólo servidor: escribe con la
 * secret key (`service_role`, que pasa el RLS sin políticas de 0008).
 * Nunca escribe el correo en los logs.
 */

const SOURCES = ["landing", "cuenta_real"] as const;

export type WaitlistSource = (typeof SOURCES)[number];

const waitlistBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Revisa el correo e inténtalo de nuevo.")
    .max(254, "Revisa el correo e inténtalo de nuevo.")
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: "Revisa el correo e inténtalo de nuevo.",
    }),
  consent: z.boolean().refine((value) => value === true, {
    message: "Acepta que te contactemos para avisarte del lanzamiento.",
  }),
  /** Trampa anti-bots: si viene llena, se responde 200 sin guardar. */
  website: z.string().max(1000).optional().default(""),
  source: z.enum(SOURCES).optional().default("landing"),
});

export type WaitlistRow = {
  email: string;
  source: WaitlistSource;
  consentVersion: string;
  country: string | null;
};

export type WaitlistStore = {
  insert(row: WaitlistRow): Promise<{ duplicate: boolean }>;
};

/**
 * Inserción real: `upsert` con `ignoreDuplicates` (equivale a
 * `on conflict (email_norm) do nothing`). Si el correo ya estaba, no falla:
 * se responde el mismo 200. Fuera de live y sin Supabase (tests, e2e mock,
 * dev), valida igual pero no persiste.
 */
export async function insertWaitlistRow(row: WaitlistRow): Promise<{ duplicate: boolean }> {
  const config = readSupabasePublicConfig();
  const secret = readSupabaseSecretKey();
  if (!config || !secret) {
    const dataMode = (process.env.DATA_MODE ?? "mock").trim();
    if (dataMode === "live") throw new Error("waitlist: falta Supabase en live");
    return { duplicate: false };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("waitlist").upsert(
    {
      email: row.email,
      source: row.source,
      consent_version: row.consentVersion,
      country: row.country,
    },
    { onConflict: "email_norm", ignoreDuplicates: true },
  );
  if (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "23505") return { duplicate: true };
    throw new Error("waitlist: no se pudo guardar");
  }
  return { duplicate: false };
}

export type WaitlistResult =
  | { status: 200; body: { message: string } }
  | { status: 400; body: { error: string } };

/**
 * Valida y guarda (o finge el guardado para la trampa). Pura salvo `store`,
 * que los tests inyectan: correo inválido → 400, sin checkbox → 400,
 * trampa llena → 200 sin insertar, repetido → el mismo 200.
 */
export async function postWaitlist(
  body: unknown,
  country: string | null,
  store: WaitlistStore = { insert: insertWaitlistRow },
): Promise<WaitlistResult> {
  const parsed = waitlistBodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      status: 400,
      body: { error: first?.message ?? "Revisa los datos e inténtalo de nuevo." },
    };
  }
  const input = parsed.data;
  if (input.website.trim() !== "") {
    return { status: 200, body: { message: WAITLIST_SUCCESS_MESSAGE } };
  }
  await store.insert({
    email: input.email,
    source: input.source,
    consentVersion: serverEnv.TERMS_VERSION,
    country,
  });
  return { status: 200, body: { message: WAITLIST_SUCCESS_MESSAGE } };
}
