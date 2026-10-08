import { orderSchema, tradeStatusQuerySchema } from "@/lib/api/contracts";
import {
  callService,
  handle,
  parseQuery,
  readOutput,
  requireSession,
  assertRealTradingEnabled,
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
    const { id } = parseQuery(req, tradeStatusQuerySchema);
    const services = getServices();
    if (isRealAccountRequest(req)) {
      // M46: sólo el camino real se apaga (503 REAL_DISABLED). El camino
      // demo de abajo sigue igual.
      assertRealTradingEnabled();
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
