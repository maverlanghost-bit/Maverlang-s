import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { claimsDemoReady, claimsOnboarded } from "@/lib/auth/registro-schema";
import { warnAuthOnce } from "@/lib/auth/mode";
import { readSupabasePublicConfig } from "@/lib/supabase/config";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

export type SessionRefresh = {
  response: NextResponse;
  hasSession: boolean;
  /** `user_metadata` del JWT. No lee `public.profiles`. */
  onboarded: boolean;
  /** M43: aceptación mínima para la demo (términos + privacidad, u onboarding antiguo). */
  demoReady: boolean;
};

/**
 * Refresca la sesión y verifica el JWT con `getClaims`.
 * No uses `getSession` acá: lee la cookie sin validarla.
 * No agregues awaits entre `createServerClient` y `getClaims`.
 */
export async function updateSession(request: NextRequest): Promise<SessionRefresh> {
  let response = NextResponse.next({ request });
  const config = readSupabasePublicConfig();
  if (!config) return { response, hasSession: false, onboarded: false, demoReady: false };

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
    const hasSession = !error && Boolean(data?.claims?.sub);
    return {
      response,
      hasSession,
      onboarded: hasSession && claimsOnboarded(data?.claims ?? null),
      demoReady: hasSession && claimsDemoReady(data?.claims ?? null),
    };
  } catch {
    warnAuthOnce(SESSION_WARN);
    return { response, hasSession: false, onboarded: false, demoReady: false };
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
