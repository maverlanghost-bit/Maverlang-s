import { historyParamsSchema, historyQuerySchema, historyResponseSchema, parseContract } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput, requireVisibleSymbol } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    const params = parseContract(historyParamsSchema, await ctx.params);
    const { range } = parseQuery(req, historyQuerySchema);
    const symbol = await requireVisibleSymbol(params.symbol);
    const services = getServices();
    const data = await callService(req, () => services.prices.history(symbol, range));
    return readOutput(historyResponseSchema, data);
  });
}
