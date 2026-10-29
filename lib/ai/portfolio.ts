import "server-only";

import { isRealAccountRequest, isUserDemoRequest } from "@/lib/api/handler";
import { DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";
import type { Portfolio } from "@/lib/types";

export type PortfolioLoad =
  | { kind: "sign-in" }
  | { kind: "no-wallet" }
  | { kind: "unavailable" }
  | { kind: "real-empty" }
  | { kind: "ok"; portfolio: Portfolio };

/**
 * Misma puerta que GET /api/portfolio: sesión, cuenta real vacía, demo por
 * usuario o cartera de la billetera. No crea órdenes.
 */
export async function loadPortfolioForAssistant(req: Request): Promise<PortfolioLoad> {
  const services = getServices();
  let session: { userId: string; walletAddress: string | null } | null;
  try {
    session = await services.auth.getSession(req);
  } catch {
    console.error("ai chat session");
    return { kind: "sign-in" };
  }
  if (!session) return { kind: "sign-in" };
  if (isRealAccountRequest(req)) return { kind: "real-empty" };
  try {
    if (isUserDemoRequest(req)) {
      return { kind: "ok", portfolio: await demoSupabase.getPortfolio(session.userId) };
    }
    let address = session.walletAddress;
    if (!address) {
      const dataMode = process.env.DATA_MODE?.trim() || "mock";
      if (dataMode !== "live" && isSupabaseAuth()) address = DEMO_WALLET_ADDRESS;
    }
    if (!address) return { kind: "no-wallet" };
    return { kind: "ok", portfolio: await services.portfolio.get(address) };
  } catch {
    console.error("ai chat portfolio");
    return { kind: "unavailable" };
  }
}
