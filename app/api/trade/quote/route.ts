import { tradeQuoteRequestSchema, tradeQuoteSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSymbol } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const body = await bodyOf(tradeQuoteRequestSchema, req);
    const symbol = requireSymbol(body.symbol);
    const services = getServices();
    const data = await callService(req, () => services.trade.quote({ ...body, symbol }));
    return readOutput(tradeQuoteSchema, data);
  });
}
