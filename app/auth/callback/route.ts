import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { callbackTarget } from "@/lib/auth/callback-next";
import { readSupabasePublicConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

function isOtpType(value: string): value is "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email" {
  return OTP_TYPES.has(value);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const pending: PendingCookie[] = [];
  let cacheHeaders: Record<string, string> = {};
  const config = readSupabasePublicConfig();
  let ok = false;

  if (config) {
    const supabase = createServerClient(config.url, config.publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          pending.splice(0, pending.length, ...cookiesToSet);
          cacheHeaders = headers;
        },
      },
    });

    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      ok = !error;
    } else {
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      if (tokenHash && type && isOtpType(type)) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        ok = !error;
      }
    }
  }

  const response = NextResponse.redirect(new URL(callbackTarget(params.get("next"), ok), request.url));
  for (const cookie of pending) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  for (const [key, value] of Object.entries(cacheHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}
