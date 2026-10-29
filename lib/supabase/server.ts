import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { readSupabasePublicConfig } from "@/lib/supabase/config";

/** Tope de Auth y del resto de lecturas con este cliente. Un JWT colgado no llega a 60 s. */
const SUPABASE_FETCH_MS = 4_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(SUPABASE_FETCH_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

/**
 * Cliente de Server Components, Server Actions y Route Handlers.
 * `cache()` lo deja en uno por request: layout y página comparten el mismo `getClaims`.
 */
export const createSupabaseServerClient = cache(async function createSupabaseServerClient() {
  const config = readSupabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    global: { fetch: fetchWithTimeout },
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
});
