import { NextResponse, type NextRequest } from "next/server";

import { decideGate, blockedCountryList } from "@/lib/auth/gate";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE, PRIVY_SESSION_COOKIE } from "@/lib/auth/cookies";
import { shouldUsePrivy } from "@/lib/auth/mode";

/**
 * Next.js 16 renombró esta convención a `proxy.ts` y avisa al compilar.
 * Se mantiene `middleware.ts` porque ARQUITECTURA §2.3 y esta tarea lo nombran.
 * Los dos archivos a la vez hacen fallar el build.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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
    usePrivy: shouldUsePrivy(),
  });

  if (decision.kind === "next") return NextResponse.next();
  if (decision.pathname === pathname && decision.search === search) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = decision.search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
