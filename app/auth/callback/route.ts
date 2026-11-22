import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { assertSameOrigin } from "@/lib/api/handler";
import { callbackTarget } from "@/lib/auth/callback-next";
import { isOtpType, isPlausibleTokenHash } from "@/lib/auth/otp";
import { safeNextPath } from "@/lib/auth/paths";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

type Verification = { ok: boolean; pending: PendingCookie[]; cacheHeaders: Record<string, string> };

function createClient(request: NextRequest, verification: Verification) {
  const config = readSupabasePublicConfig();
  if (!config) return null;
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        verification.pending.splice(0, verification.pending.length, ...cookiesToSet);
        verification.cacheHeaders = headers;
      },
    },
  });
}

function redirectWith(request: NextRequest, next: string | null, verification: Verification, status: number) {
  const response = NextResponse.redirect(new URL(callbackTarget(next, verification.ok), request.url), status);
  for (const cookie of verification.pending) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  for (const [key, value] of Object.entries(verification.cacheHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * GET: sólo canjea el flujo PKCE (`code`): el verificador vive en una cookie de
 * este navegador, así que un enlace ajeno no sirve (AUTH-3).
 * Un `token_hash` en GET NO se verifica: un escáner de correo, un prefetch o un
 * enlace plantado dejarían iniciar sesión sin que la persona lo confirme
 * (login CSRF). Se redirige a `/auth/confirmar`, que hace el POST.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const code = params.get("code");

  if (!code && tokenHash) {
    const confirm = new URL("/auth/confirmar", request.url);
    confirm.searchParams.set("token_hash", tokenHash);
    const type = params.get("type");
    if (type) confirm.searchParams.set("type", type);
    const next = safeNextPath(params.get("next"));
    if (next) confirm.searchParams.set("next", next);
    return NextResponse.redirect(confirm);
  }

  const verification: Verification = { ok: false, pending: [], cacheHeaders: {} };
  if (code) {
    const supabase = createClient(request, verification);
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      verification.ok = !error;
    }
  }
  return redirectWith(request, params.get("next"), verification, 307);
}

/**
 * POST desde `/auth/confirmar`: exige mismo origen (AUTH-3) y recién ahí
 * verifica el `token_hash`. 303 para que el navegador siga con GET.
 */
export async function POST(request: NextRequest) {
  const verification: Verification = { ok: false, pending: [], cacheHeaders: {} };
  let next: string | null = null;
  try {
    assertSameOrigin(request);
    const form = await request.formData();
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : null;
    };
    next = field("next");
    const tokenHash = field("token_hash");
    const type = field("type");
    if (isPlausibleTokenHash(tokenHash) && isOtpType(type)) {
      const supabase = createClient(request, verification);
      if (supabase) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        verification.ok = !error;
      }
    }
  } catch {
    verification.ok = false;
    verification.pending = [];
  }
  return redirectWith(request, next, verification, 303);
}
