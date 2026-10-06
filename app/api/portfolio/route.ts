import { portfolioSchema } from "@/lib/api/contracts";
import {
  callService,
  handle,
  readOutput,
  requireSession,
  requireWallet,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    if (isRealAccountRequest(req)) {
      return readOutput(portfolioSchema, {
        address: session.userId,
        totalUsd: 0,
        cashUsdc: 0,
        positions: [],
        pnlUsd: null,
        pnlPct: null,
        updatedAt: new Date().toISOString(),
      });
    }
    if (isUserDemoRequest(req)) {
      const data = await callService(req, () => demoSupabase.getPortfolio(session.userId));
      return readOutput(portfolioSchema, data);
    }
    const address = requireWallet(session);
    const data = await callService(req, () => services.portfolio.get(address));
    return readOutput(portfolioSchema, data);
  });
}
