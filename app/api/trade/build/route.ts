import { tradeBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import {
  parseJson,
  assertSameOrigin,
  assertRealTradingEnabled,
  callService,
  handle,
  readOutput,
  requireSession,
  requireSupabaseUser,
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
    await requireSupabaseUser(services, req);
    const body = await parseJson(req, tradeBuildRequestSchema);
    if (isRealAccountRequest(req)) {
      // M46: el camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Con el flag encendido, pasa al motor live
      // de abajo. El camino demo sigue igual.
      assertRealTradingEnabled();
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
