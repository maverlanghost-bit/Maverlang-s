import "server-only";

import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { insertWaitlistRow } from "@/lib/services/waitlist.supabase";
import { WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist/message";

export { insertWaitlistRow };

export { WAITLIST_SUCCESS_MESSAGE };

/**
 * Lista de espera de la cuenta Real (M45). Sólo servidor.
 * La escritura con la secret key está en `lib/services/waitlist.supabase.ts`
 * (lista blanca M57). Nunca escribe el correo en los logs.
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
