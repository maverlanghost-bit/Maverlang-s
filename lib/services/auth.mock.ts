import "server-only";

import { MOCK_SESSION_COOKIE, readCookieValue } from "@/lib/auth/cookies";
import { DEMO_USER_ID, DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";
import { simulateMock } from "@/lib/mocks/latency";

export { MOCK_SESSION_COOKIE };

export const mockAuth = {
  async getSession(req: Request): Promise<{ userId: string; walletAddress: string | null } | null> {
    return simulateMock("auth-session", () => {
      const session = readCookieValue(req.headers.get("cookie"), MOCK_SESSION_COOKIE);
      if (!session) return null;
      return { userId: DEMO_USER_ID, walletAddress: DEMO_WALLET_ADDRESS };
    });
  },
};
