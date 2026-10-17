import { pricesQuerySchema, quotesResponseSchema } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput, requireVisibleSymbol } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Precios públicos del catálogo (M84): CDN 15 s + stale-while-revalidate,
 * coherente con el polling de 15 s de la lista. Nunca datos de usuario.
 */
export function GET(req: Request) {
  return handle("swr15", async () => {
    const ipLimited = await withRateLimit(req, "prices");
    if (ipLimited) return ipLimited;
    const { symbols } = parseQuery(req, pricesQuerySchema);
    const allowed = await Promise.all(symbols.map((symbol) => requireVisibleSymbol(symbol)));
    const services = getServices();
    const data = await callService(req, () => services.prices.list(allowed));
    return readOutput(quotesResponseSchema, data);
  });
}
