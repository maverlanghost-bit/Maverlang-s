import "server-only";

import { DEMO_USER_ID, DEMO_WALLET_ADDRESS } from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";

/** Cookie de sesión mock. Cualquier valor no vacío entra como la cuenta demo. */
export const MOCK_SESSION_COOKIE = "a24_mock_session";

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return value === "" ? null : value;
  }
  return null;
}

export const mockAuth = {
  async getSession(req: Request): Promise<{ userId: string; walletAddress: string | null } | null> {
    return simulateMock("auth-session", () => {
      const session = readCookie(req.headers.get("cookie"), MOCK_SESSION_COOKIE);
      if (!session) return null;
      return { userId: DEMO_USER_ID, walletAddress: DEMO_WALLET_ADDRESS };
    });
  },
};
