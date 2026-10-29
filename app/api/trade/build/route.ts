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
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";
import { assertRealTradeAllowed } from "@/lib/trade/real-guards";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    assertSameOrigin(req);
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    if (session) {
      const userLimited =
        (await withRateLimit(req, "trade", [session.userId])) ??
        (isUserDemoRequest(req) ? await withRateLimit(req, "demoTrade", [session.userId]) : null);
      if (userLimited) return userLimited;
    }
    const body = await parseJson(req, tradeBuildRequestSchema);
    if (isRealAccountRequest(req)) {
      // M46: el camino real se apaga (503 REAL_DISABLED) hasta que
      // REAL_TRADING_READY=true. Con el flag encendido, pasa al motor live
      // de abajo. El camino demo sigue igual.
      assertRealTradingEnabled();
      // M74: kill switch → beta → límites. La carrera de dos builds
      // simultáneos se corta acá: cada build re-comprueba los topes antes
      // de armar la tx y submit vuelve a comprobarlos al firmar.
      const userId = session?.userId ?? (await requireSession(services, req)).userId;
      await assertRealTradeAllowed(userId, null);
    }
    if (isUserDemoRequest(req)) {
      const userId = session?.userId ?? (await requireSession(services, req)).userId;
      const data = await callService(req, () => demoSupabase.trade.build(userId, body));
      return readOutput(tradeBuildResponseSchema, data);
    }
    const data = await callService(req, () => services.trade.build(body));
    return readOutput(tradeBuildResponseSchema, data);
  });
}
