import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { gateFromAppMetadata, gateFromComplianceRows } from "@/lib/auth/registro-schema";
import { warnAuthOnce } from "@/lib/auth/mode";
import { readSupabasePublicConfig } from "@/lib/supabase/config";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

export type SessionRefresh = {
  response: NextResponse;
  hasSession: boolean;
  /** `app_metadata` o `profiles.onboarding_completed`. No usa `user_metadata`. */
  onboarded: boolean;
  /** Aceptación en `app_metadata` o en `consents` (términos + privacidad). */
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
    let onboarded = false;
    let demoReady = false;
    if (hasSession) {
      // SEC-07: el usuario puede reescribir `user_metadata`. El gate mira
      // `app_metadata` y, si no alcanza, consents/profiles con su JWT.
      const fromApp = gateFromAppMetadata(data?.claims ?? null);
      onboarded = fromApp.onboarded;
      demoReady = fromApp.demoReady;
      if (!onboarded || !demoReady) {
        const [consentsResult, profileResult] = await Promise.all([
          supabase.from("consents").select("doc,version"),
          supabase.from("profiles").select("onboarding_completed").maybeSingle(),
        ]);
        const fromRows = gateFromComplianceRows({
          consents: consentsResult.error ? [] : (consentsResult.data ?? []),
          onboardingCompleted:
            !profileResult.error && profileResult.data?.onboarding_completed === true,
        });
        if (fromRows.onboarded) onboarded = true;
        if (fromRows.demoReady) demoReady = true;
      }
    }
    return { response, hasSession, onboarded, demoReady };
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

/**
 * M48b-fix: une la respuesta de Supabase (`refreshed`) con la respuesta del
 * middleware (`next`) copiando SOLO cookies y cabeceras de caché.
 * Nunca copia cabeceras `x-middleware-*`: `refreshed` es un
 * `NextResponse.next({ request })` construido con el request ORIGINAL (sin
 * `x-nonce`/CSP), y copiar todas sus cabeceras pisaría el
 * `x-middleware-override-headers` de `next`, haciendo que Next no vea el
 * nonce y los scripts se bloqueen con `strict-dynamic` en modo enforce.
 */
export function mergeSupabaseIntoNext(from: NextResponse, to: NextResponse): void {
  copySupabaseResponse(from, to);
}
