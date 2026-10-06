import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { warnAuthOnce } from "@/lib/auth/mode";
import { readSupabasePublicConfig } from "@/lib/supabase/config";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

export type SessionRefresh = {
  response: NextResponse;
  hasSession: boolean;
};

/**
 * Refresca la sesión y verifica el JWT con `getClaims`.
 * No uses `getSession` acá: lee la cookie sin validarla.
 * No agregues awaits entre `createServerClient` y `getClaims`.
 */
export async function updateSession(request: NextRequest): Promise<SessionRefresh> {
  let response = NextResponse.next({ request });
  const config = readSupabasePublicConfig();
  if (!config) return { response, hasSession: false };

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims();
    return { response, hasSession: !error && Boolean(data?.claims?.sub) };
  } catch {
    warnAuthOnce(SESSION_WARN);
    return { response, hasSession: false };
  }
}

/** El redirect tiene que llevar las cookies y los headers de caché del refresco. */
export function copySupabaseResponse(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  for (const header of CACHE_HEADERS) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
}
