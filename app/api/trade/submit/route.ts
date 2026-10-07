import { tradeSubmitRequestSchema, tradeSubmitResponseSchema } from "@/lib/api/contracts";
import {
  bodyOf,
  callService,
  handle,
  readOutput,
  requireSession,
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
    const [body, session] = await Promise.all([
      bodyOf(tradeSubmitRequestSchema, req),
      requireSession(services, req),
    ]);
    if (isRealAccountRequest(req)) {
      throw new DomainError("VALIDATION", "La cuenta real todavía no opera.");
    }
    const userLimited = await withRateLimit(req, "trade", [session.userId]);
    if (userLimited) return userLimited;
    if (isUserDemoRequest(req)) {
      const demoLimited = await withRateLimit(req, "demoTrade", [session.userId]);
      if (demoLimited) return demoLimited;
      const data = await callService(req, () => demoSupabase.trade.submit(session.userId, body));
      return readOutput(tradeSubmitResponseSchema, data);
    }
    const data = await callService(req, () => services.trade.submit(body, session.userId));
    return readOutput(tradeSubmitResponseSchema, data);
  });
}
