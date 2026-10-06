import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readSupabasePublicConfig } from "@/lib/supabase/config";
import { readSupabaseSecretKey } from "@/lib/supabase/secret";

/**
 * Cliente con la clave de servidor, para tareas de servidor y scripts.
 * No guarda sesión. No importar desde componentes cliente.
 */
export function createSupabaseAdminClient() {
  const config = readSupabasePublicConfig();
  const secret = readSupabaseSecretKey();
  if (!config || !secret) {
    throw new Error("Falta la configuración de Supabase en el servidor.");
  }
  return createClient(config.url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
