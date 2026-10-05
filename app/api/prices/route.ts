import { pricesQuerySchema, quotesResponseSchema } from "@/lib/api/contracts";
import { callService, handle, queryOf, readOutput, requireSymbol } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Precios: no-store. Sin `symbols`, el servicio devuelve los tickers enabled. */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const { symbols } = queryOf(pricesQuerySchema, req);
    const allowed = symbols.map((symbol) => requireSymbol(symbol));
    const services = getServices();
    const data = await callService(req, () => services.prices.list(allowed));
    return readOutput(quotesResponseSchema, data);
  });
}
