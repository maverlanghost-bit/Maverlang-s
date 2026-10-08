import { NextResponse, type NextRequest } from "next/server";

import { decideGate, blockedCountryList } from "@/lib/auth/gate";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE, PRIVY_SESSION_COOKIE } from "@/lib/auth/cookies";
import { isSupabaseAuth, shouldUsePrivy } from "@/lib/auth/mode";
import { copySupabaseResponse, mergeSupabaseIntoNext, updateSession } from "@/lib/supabase/middleware";
import { applyStaticHeaders } from "@/lib/security/headers";
import { buildCsp, generateNonce, resolveCspMode } from "@/lib/security/csp";

/**
 * Next.js 16 renombró esta convención a `proxy.ts` y avisa al compilar.
 * Se mantiene `middleware.ts` porque ARQUITECTURA §2.3 lo nombra.
 * Los dos archivos a la vez hacen fallar el build.
 * En modo supabase, `updateSession` refresca la cookie y `getClaims` decide la sesión.
 *
 * M48: nonce por solicitud (guía de CSP de Next 16). El nonce viaja en la
 * CSP pedida (`Content-Security-Policy` del request) y en `x-nonce` para que
 * Next lo inyecte en los scripts; la respuesta lleva la CSP (`enforce`) o
 * `Content-Security-Policy-Report-Only` (`report-only`) más las cabeceras
 * estáticas. `CSP_MODE=off` apaga sólo la CSP. Las rutas API no pasan por
 * acá (matcher): su `nosniff` sale de `next.config.ts` y `jsonResult`.
 */
function securityOf(request: NextRequest): {
  nonce: string;
  isProd: boolean;
  requestHeaders: Headers;
  cspName: string | null;
  cspValue: string | null;
} {
  const nonce = generateNonce();
  const isProd = process.env.NODE_ENV === "production";
  const mode = resolveCspMode(process.env.CSP_MODE, process.env.NODE_ENV);
  const cspValue =
    mode === "off"
      ? null
      : buildCsp({
          nonce,
          isDev: !isProd,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
          rpcCluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
          reportUri: process.env.CSP_REPORT_URI,
        });
  const cspName =
    cspValue === null
      ? null
      : mode === "report-only"
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  if (cspValue) requestHeaders.set("Content-Security-Policy", cspValue);
  return { nonce, isProd, requestHeaders, cspName, cspValue };
}

function applySecurity(
  response: NextResponse,
  security: { isProd: boolean; cspName: string | null; cspValue: string | null },
): NextResponse {
  applyStaticHeaders(response.headers, { isProd: security.isProd });
  if (security.cspName && security.cspValue) {
    response.headers.set(security.cspName, security.cspValue);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const security = securityOf(request);
  const { pathname, search } = request.nextUrl;
  const useSupabase = isSupabaseAuth();

  let supabaseSession = false;
  let supabaseOnboarded = false;
  let supabaseDemoReady = false;
  let refreshed: NextResponse | null = null;
  if (useSupabase) {
    const updated = await updateSession(request);
    supabaseSession = updated.hasSession;
    supabaseOnboarded = updated.onboarded;
    supabaseDemoReady = updated.demoReady;
    refreshed = updated.response;
  }

  // M57: /admin queda fuera del geobloqueo de visitantes.
  // requireAdmin igual exige sesión y MFA; si no, la página responde 404.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const next = NextResponse.next({ request: { headers: security.requestHeaders } });
    if (refreshed) {
      mergeSupabaseIntoNext(refreshed, next);
    }
    return applySecurity(next, security);
  }

  const decision = decideGate({
    pathname,
    search,
    countryHeader: request.headers.get("x-vercel-ip-country"),
    countryQuery: request.nextUrl.searchParams.get("country"),
    nodeEnv: process.env.NODE_ENV,
    blockedCountries: blockedCountryList(process.env.GEO_BLOCKED_COUNTRIES),
    mockSession: request.cookies.get(MOCK_SESSION_COOKIE)?.value ?? null,
    onboarding: request.cookies.get(MOCK_ONBOARDING_COOKIE)?.value ?? null,
    privyToken: request.cookies.get(PRIVY_SESSION_COOKIE)?.value ?? null,
    usePrivy: useSupabase ? false : shouldUsePrivy(),
    useSupabase,
    supabaseSession,
    supabaseOnboarded,
    supabaseDemoReady,
  });

  if (decision.kind === "next" || (decision.pathname === pathname && decision.search === search)) {
    const next = NextResponse.next({ request: { headers: security.requestHeaders } });
    if (refreshed) {
      mergeSupabaseIntoNext(refreshed, next);
    }
    return applySecurity(next, security);
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = decision.search;
  const redirect = NextResponse.redirect(url);
  if (refreshed) copySupabaseResponse(refreshed, redirect);
  return applySecurity(redirect, security);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
