import { tradeSubmitRequestSchema, tradeSubmitResponseSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    const [body, session] = await Promise.all([
      bodyOf(tradeSubmitRequestSchema, req),
      requireSession(services, req),
    ]);
    const data = await callService(req, () => services.trade.submit(body, session.userId));
    return readOutput(tradeSubmitResponseSchema, data);
  });
}
