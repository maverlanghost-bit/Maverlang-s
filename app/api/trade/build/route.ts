import { tradeBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import {
  bodyOf,
  callService,
  handle,
  readOutput,
  requireSession,
  requireSupabaseUser,
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
    const body = await bodyOf(tradeBuildRequestSchema, req);
    if (isRealAccountRequest(req)) {
      throw new DomainError("VALIDATION", "La cuenta real todavía no opera.");
    }
    if (isUserDemoRequest(req)) {
      const session = await requireSession(services, req);
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (await withRateLimit(req, "demoTrade", [session.userId]));
      if (userLimited) return userLimited;
      const data = await callService(req, () => demoSupabase.trade.build(session.userId, body));
      return readOutput(tradeBuildResponseSchema, data);
    }
    const data = await callService(req, () => services.trade.build(body));
    return readOutput(tradeBuildResponseSchema, data);
  });
}
