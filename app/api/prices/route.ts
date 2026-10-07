import { pricesQuerySchema, quotesResponseSchema } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput, requireSymbol } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Precios: no-store. Sin `symbols`, el servicio devuelve los tickers enabled. */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "prices");
    if (ipLimited) return ipLimited;
    const { symbols } = parseQuery(req, pricesQuerySchema);
    const allowed = symbols.map((symbol) => requireSymbol(symbol));
    const services = getServices();
    const data = await callService(req, () => services.prices.list(allowed));
    return readOutput(quotesResponseSchema, data);
  });
}
