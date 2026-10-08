import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import { readSupabaseSecretKey } from "@/lib/supabase/secret";

/**
 * Escritura de la lista de espera (M45) con la secret key.
 * Vive en `lib/services/*.supabase.ts` para que el cliente admin no salga
 * de la lista blanca (M57). No corre desde un componente cliente.
 */
export async function insertWaitlistRow(row: {
  email: string;
  source: string;
  consentVersion: string;
  country: string | null;
}): Promise<{ duplicate: boolean }> {
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
