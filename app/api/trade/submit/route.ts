import { tradeSubmitRequestSchema, tradeSubmitResponseSchema } from "@/lib/api/contracts";
import {
  parseJson,
  assertSameOrigin,
  assertRealTradingEnabled,
  callService,
  handle,
  readOutput,
  requireSession,
  isRealAccountRequest,
  isUserDemoRequest,
} from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    assertSameOrigin(req);
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSession(services, req);
    const body = await parseJson(req, tradeSubmitRequestSchema);
    if (isRealAccountRequest(req)) {
      // M46: el camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Con el flag encendido, pasa al motor live.
      assertRealTradingEnabled();
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
