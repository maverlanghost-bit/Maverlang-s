import { historyParamsSchema, historyQuerySchema, historyResponseSchema, parseContract } from "@/lib/api/contracts";
import { callService, handle, queryOf, readOutput, requireSymbol } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    const params = parseContract(historyParamsSchema, await ctx.params);
    const { range } = queryOf(historyQuerySchema, req);
    const symbol = requireSymbol(params.symbol);
    const services = getServices();
    const data = await callService(req, () => services.prices.history(symbol, range));
    return readOutput(historyResponseSchema, data);
  });
}
