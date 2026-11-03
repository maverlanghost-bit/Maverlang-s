import "server-only";

import { MOCK_SESSION_COOKIE, readCookieValue } from "@/lib/auth/cookies";
import { DEMO_USER_ID, DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";
import { isMockAuthAllowed, warnAuthOnce, type AuthEnvSignals } from "@/lib/auth/mode";
import { simulateMock } from "@/lib/mocks/latency";

export { MOCK_SESSION_COOKIE };

export type MockSession = { userId: string; walletAddress: string | null };

const MOCK_BLOCKED_WARN =
  "[auth] Cookie mock ignorada: en producción la demo requiere ALLOW_MOCK_AUTH=true.";

/**
 * A-01: fuera de producción cualquier cookie no vacía entra como la cuenta
 * demo, igual que antes. En producción sólo con `ALLOW_MOCK_AUTH=true`
 * explícito; si no, la cookie no autentica (se trata como sin sesión).
 * `env` permite fijar las señales en tests sin tocar `process.env`.
 */
export function mockSessionFromCookie(
  cookieHeader: string | null | undefined,
  env: AuthEnvSignals = {},
): MockSession | null {
  const session = readCookieValue(cookieHeader, MOCK_SESSION_COOKIE);
  if (!session) return null;
  if (!isMockAuthAllowed(env)) {
    warnAuthOnce(MOCK_BLOCKED_WARN);
    return null;
  }
  return { userId: DEMO_USER_ID, walletAddress: DEMO_WALLET_ADDRESS };
}

export const mockAuth = {
  async getSession(req: Request): Promise<MockSession | null> {
    return simulateMock("auth-session", () => mockSessionFromCookie(req.headers.get("cookie")));
  },
};
