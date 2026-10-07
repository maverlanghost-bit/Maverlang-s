import { tradeQuoteRequestSchema, tradeQuoteSchema } from "@/lib/api/contracts";
import {
  bodyOf,
  callService,
  handle,
  readOutput,
  requireSession,
  requireSupabaseUser,
  requireSymbol,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    await requireSupabaseUser(services, req);
    const body = await bodyOf(tradeQuoteRequestSchema, req);
    const symbol = requireSymbol(body.symbol);
    if (isRealAccountRequest(req)) {
      throw new DomainError("VALIDATION", "La cuenta real todavía no opera.");
    }
    if (isUserDemoRequest(req)) {
      const session = await requireSession(services, req);
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (await withRateLimit(req, "demoTrade", [session.userId]));
      if (userLimited) return userLimited;
      const data = await callService(req, () => demoSupabase.trade.quote(session.userId, { ...body, symbol }));
      return readOutput(tradeQuoteSchema, data);
    }
    const data = await callService(req, () => services.trade.quote({ ...body, symbol }));
    return readOutput(tradeQuoteSchema, data);
  });
}
