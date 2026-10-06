import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readSupabasePublicConfig } from "@/lib/supabase/config";

/** Cliente de Server Components, Server Actions y Route Handlers. Uno por request. */
export async function createSupabaseServerClient() {
  const config = readSupabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        void headers;
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // En un Server Component las cookies son de sólo lectura.
          // El middleware refresca la sesión.
        }
      },
    },
  });
}
