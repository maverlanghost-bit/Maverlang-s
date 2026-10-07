import { orderSchema, tradeStatusQuerySchema } from "@/lib/api/contracts";
import {
  callService,
  handle,
  queryOf,
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
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const { id } = queryOf(tradeStatusQuerySchema, req);
    const services = getServices();
    if (isRealAccountRequest(req)) {
      throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
    }
    if (isUserDemoRequest(req)) {
      const session = await requireSession(services, req);
      const userLimited = await withRateLimit(req, "trade", [session.userId]);
      if (userLimited) return userLimited;
      const data = await callService(req, () => demoSupabase.trade.status(session.userId, id));
      return readOutput(orderSchema, data);
    }
    const userLimited = await withRateLimit(req, "trade");
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.trade.status(id));
    return readOutput(orderSchema, data);
  });
}
