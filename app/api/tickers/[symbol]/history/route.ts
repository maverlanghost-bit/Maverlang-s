import { historyParamsSchema, historyQuerySchema, historyResponseSchema, parseContract } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput, requireVisibleSymbol } from "@/lib/api/handler";
import { getServices } from "@/lib/services";
import { readHistory } from "@/lib/services/price-ticks.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    const params = parseContract(historyParamsSchema, await ctx.params);
    const { range } = parseQuery(req, historyQuerySchema);
    const symbol = await requireVisibleSymbol(params.symbol);
    const services = getServices();
    // La serie es real si hay observaciones en price_ticks (backfill/grabador);
    // mientras no, sigue siendo la serie de referencia (mock).
    const [points, realPoints] = await Promise.all([
      callService(req, () => services.prices.history(symbol, range)),
      readHistory(symbol, range).catch(() => []),
    ]);
    return readOutput(historyResponseSchema, { points, real: realPoints.length >= 2 });
  });
}
