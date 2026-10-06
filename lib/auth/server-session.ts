import "server-only";

import { cookies } from "next/headers";

import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE, ONBOARDING_DONE, PRIVY_SESSION_COOKIE } from "@/lib/auth/cookies";
import { hasAuthSession } from "@/lib/auth/gate";
import { shouldUsePrivy } from "@/lib/auth/mode";

export type ServerSession = {
  hasSession: boolean;
  onboarded: boolean;
};

/**
 * Lee las mismas cookies que el gate.
 * Cuando entre Supabase, este helper se reemplaza; las pantallas no leen la cookie.
 */
export async function readServerSession(): Promise<ServerSession> {
  const jar = await cookies();
  const mockSession = jar.get(MOCK_SESSION_COOKIE)?.value ?? null;
  const privyToken = jar.get(PRIVY_SESSION_COOKIE)?.value ?? null;
  const onboarding = jar.get(MOCK_ONBOARDING_COOKIE)?.value ?? null;
  return {
    hasSession: hasAuthSession({
      usePrivy: shouldUsePrivy(),
      mockSession: mockSession && mockSession.length > 0 ? mockSession : null,
      privyToken: privyToken && privyToken.length > 0 ? privyToken : null,
    }),
    onboarded: onboarding === ONBOARDING_DONE,
  };
}
