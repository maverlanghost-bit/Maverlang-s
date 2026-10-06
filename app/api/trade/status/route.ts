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
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("no-store", async () => {
    const { id } = queryOf(tradeStatusQuerySchema, req);
    const services = getServices();
    if (isRealAccountRequest(req)) {
      throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
    }
    if (isUserDemoRequest(req)) {
      const session = await requireSession(services, req);
      const data = await callService(req, () => demoSupabase.trade.status(session.userId, id));
      return readOutput(orderSchema, data);
    }
    const data = await callService(req, () => services.trade.status(id));
    return readOutput(orderSchema, data);
  });
}
