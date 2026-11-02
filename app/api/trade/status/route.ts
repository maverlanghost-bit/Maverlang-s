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
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";
import { assertRealTradingDataMode } from "@/lib/trade/real-guards";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** El servicio live acepta el userId para exigir dueño en la lectura. */
type OwnerScopedStatus = (id: string, userId?: string) => Promise<Order>;

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
      // Sin DATA_MODE=live el motor sería mock: se falla cerrado.
      assertRealTradingDataMode();
      const session = await requireSession(services, req);
      const userLimited = await withRateLimit(req, "trade", [session.userId]);
      if (userLimited) return userLimited;
      // La lectura exige `user_id`: un id ajeno → NOT_FOUND, sin filtrar
      // datos ni tocar el estado de la orden.
      const status = services.trade.status as OwnerScopedStatus;
      const data = await callService(req, () => status(id, session.userId));
      return readOutput(orderSchema, data);
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
