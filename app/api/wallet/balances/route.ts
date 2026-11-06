import { balancesResponseSchema } from "@/lib/api/contracts";
import {
  callService,
  handle,
  readOutput,
  requireSession,
  requireWallet,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { serverEnv } from "@/lib/env";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    // Cuenta real: con DATA_MODE=live y billetera verificada leemos la cadena.
    // Sin billetera o en mock se mantiene el estado vacío (nunca se inventa saldo).
    if (isRealAccountRequest(req)) {
      if (serverEnv.DATA_MODE === "live" && session.walletAddress) {
        const address = session.walletAddress;
        const data = await callService(req, () => services.portfolio.balances(address));
        return readOutput(balancesResponseSchema, data);
      }
      return readOutput(balancesResponseSchema, []);
    }
    if (isUserDemoRequest(req)) {
      const data = await callService(req, () => demoSupabase.getBalances(session.userId));
      return readOutput(balancesResponseSchema, data);
    }
    const address = requireWallet(session);
    const data = await callService(req, () => services.portfolio.balances(address));
    return readOutput(balancesResponseSchema, data);
  });
}
