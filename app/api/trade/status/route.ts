import { orderSchema, tradeStatusQuerySchema } from "@/lib/api/contracts";
import { callService, handle, queryOf, readOutput } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("no-store", async () => {
    const { id } = queryOf(tradeStatusQuerySchema, req);
    const services = getServices();
    const data = await callService(req, () => services.trade.status(id));
    return readOutput(orderSchema, data);
  });
}
