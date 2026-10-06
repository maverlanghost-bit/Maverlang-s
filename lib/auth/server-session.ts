import "server-only";

import { cookies } from "next/headers";

import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE, ONBOARDING_DONE, PRIVY_SESSION_COOKIE } from "@/lib/auth/cookies";
import { hasAuthSession } from "@/lib/auth/gate";
import { isSupabaseAuth, shouldUsePrivy, warnAuthOnce } from "@/lib/auth/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServerSession = {
  hasSession: boolean;
  onboarded: boolean;
};

const SESSION_WARN = "No se pudo verificar la sesión de Supabase. Se trata como sin sesión.";

/**
 * Misma regla que el gate.
 * En supabase, `getClaims` verifica el JWT. No se usa `getSession` para decidir.
 */
export async function readServerSession(): Promise<ServerSession> {
  const jar = await cookies();
  const onboarding = jar.get(MOCK_ONBOARDING_COOKIE)?.value ?? null;
  const onboarded = onboarding === ONBOARDING_DONE;

  if (isSupabaseAuth()) {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return { hasSession: false, onboarded };
      const { data, error } = await supabase.auth.getClaims();
      return { hasSession: !error && Boolean(data?.claims?.sub), onboarded };
    } catch {
      warnAuthOnce(SESSION_WARN);
      return { hasSession: false, onboarded };
    }
  }

  const mockSession = jar.get(MOCK_SESSION_COOKIE)?.value ?? null;
  const privyToken = jar.get(PRIVY_SESSION_COOKIE)?.value ?? null;
  return {
    hasSession: hasAuthSession({
      useSupabase: false,
      supabaseSession: false,
      usePrivy: shouldUsePrivy(),
      mockSession: mockSession && mockSession.length > 0 ? mockSession : null,
      privyToken: privyToken && privyToken.length > 0 ? privyToken : null,
    }),
    onboarded,
  };
}
