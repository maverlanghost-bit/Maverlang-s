import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { accessTokenAal, mfaPendingForUser } from "@/lib/auth/mfa-policy";
import { gateFromComplianceRows } from "@/lib/auth/registro-schema";
import { warnAuthOnce } from "@/lib/auth/mode";
import { serverEnv } from "@/lib/env";
import { readSupabasePublicConfig } from "@/lib/supabase/config";

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

/**
 * DB-03: el gate lee la prueba de la declaración U.S. person, no sólo el flag.
 * `is_us_person` nace en `false`; sin versión y fecha del servidor no hay
 * onboarding real, sólo demo.
 */
const PROFILE_GATE_COLUMNS =
  "onboarding_completed,is_us_person,us_person_declaration_version,us_person_declared_at";

export type SessionRefresh = {
  response: NextResponse;
  hasSession: boolean;
  /**
   * Onboarding real verificado: fila de `profiles` con `onboarding_completed`
   * y declaración U.S. person con versión + fecha. Es la única autoridad:
   * `app_metadata`/`user_metadata` no lo conceden, y un perfil ausente o un
   * error de lectura siempre da `false`.
   */
  onboarded: boolean;
  /**
   * Demo: aceptación mínima en `consents` (términos + privacidad). Puede ser
   * `true` con `onboarded=false`; un "sí" a U.S. person no da demo.
   */
  demoReady: boolean;
  /** `true` si hay TOTP verificado y la sesión no está en `aal2` (fail-closed). */
  mfaRequired: boolean;
};

/**
 * Refresca la sesión y verifica el JWT con `getClaims`.
 * No decidas la sesión con `getSession`: lee la cookie sin validarla. Acá sólo
 * se usa para obtener el token que después valida `getUser(jwt)`.
 * No agregues awaits entre `createServerClient` y `getClaims`.
 *
 * `checkMfa` sólo se pide en rutas privadas: `getUser(jwt)` es una llamada a
 * Auth, pero es la única forma fiable de saber si el usuario tiene un factor
 * verificado (el claim `aal` por sí solo no lo dice).
 */
export async function updateSession(
  request: NextRequest,
  options: { checkMfa?: boolean } = {},
): Promise<SessionRefresh> {
  let response = NextResponse.next({ request });
  const config = readSupabasePublicConfig();
  if (!config) {
    return { response, hasSession: false, onboarded: false, demoReady: false, mfaRequired: false };
  }

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
    let mfaRequired = false;
    if (hasSession) {
      // SEC-07: el usuario puede reescribir `user_metadata`; por eso el gate
      // lee las filas del servidor con su JWT. DB-03: `app_metadata` tampoco
      // es la autoridad: se consultan `profiles` y `consents` SIEMPRE, aunque
      // el JWT parezca completo. Un token viejo no puede tapar una fila que
      // bloquea ni autorizar un onboarding que la fila no respalda.
      // La versión vigente sale del env validado del servidor, no de la
      // constante pública ni de lo que diga el JWT.
      const expectedDeclarationVersion = serverEnv.US_PERSON_DECLARATION_VERSION;
      const [consentsResult, profileResult] = await Promise.all([
        supabase.from("consents").select("doc,version"),
        supabase.from("profiles").select(PROFILE_GATE_COLUMNS).maybeSingle(),
      ]);
      // Error de lectura o fila ausente = sin perfil. Nunca autoriza onboarding
      // real (fail-closed); la demo sigue saliendo sólo de `consents`.
      const profile = profileResult.error ? null : profileResult.data;
      const fromRows = gateFromComplianceRows(
        {
          consents: consentsResult.error ? [] : (consentsResult.data ?? []),
          onboardingCompleted: profile?.onboarding_completed === true,
          isUsPerson: profile?.is_us_person ?? null,
          usPersonDeclarationVersion: profile?.us_person_declaration_version ?? null,
          usPersonDeclaredAt: profile?.us_person_declared_at ?? null,
        },
        expectedDeclarationVersion,
      );
      // DB-03: la fila del servidor manda. Un `is_us_person=true` en
      // `profiles` prevalece sobre cualquier `app_metadata` y sobre los
      // consentimientos: no hay onboarding real ni demo.
      if (profile?.is_us_person === true) {
        onboarded = false;
        demoReady = false;
      } else {
        onboarded = fromRows.onboarded;
        // Demo: aceptación mínima real en `consents` (términos + privacidad).
        demoReady = fromRows.demoReady;
      }
      if (options.checkMfa) {
        // Fail-closed: si no hay token, el usuario no se puede validar o el
        // nivel es ambiguo, se exige el segundo paso. Un fallo del chequeo no
        // debe borrar la sesión: la pantalla de verificación reintenta.
        mfaRequired = true;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token ?? null;
          if (token) {
            const { data: userData, error: userError } = await supabase.auth.getUser(token);
            if (!userError && userData.user) {
              mfaRequired = mfaPendingForUser({
                aal: accessTokenAal(token),
                factors: userData.user.factors,
              });
            }
          }
        } catch {
          mfaRequired = true;
        }
      }
    }
    return { response, hasSession, onboarded, demoReady, mfaRequired };
  } catch {
    warnAuthOnce(SESSION_WARN);
    return { response, hasSession: false, onboarded: false, demoReady: false, mfaRequired: false };
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
