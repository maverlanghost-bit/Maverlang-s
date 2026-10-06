import { NextResponse, type NextRequest } from "next/server";

import { decideGate, blockedCountryList } from "@/lib/auth/gate";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE, PRIVY_SESSION_COOKIE } from "@/lib/auth/cookies";
import { isSupabaseAuth, shouldUsePrivy } from "@/lib/auth/mode";
import { copySupabaseResponse, updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renombró esta convención a `proxy.ts` y avisa al compilar.
 * Se mantiene `middleware.ts` porque ARQUITECTURA §2.3 lo nombra.
 * Los dos archivos a la vez hacen fallar el build.
 * En modo supabase, `updateSession` refresca la cookie y `getClaims` decide la sesión.
 */
export async function middleware(request: NextRequest) {
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
    return refreshed ?? NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = decision.search;
  const redirect = NextResponse.redirect(url);
  if (refreshed) copySupabaseResponse(refreshed, redirect);
  return redirect;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
