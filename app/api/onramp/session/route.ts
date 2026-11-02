import { PESO_DEPOSITS_ENABLED } from "@/config/onramp";
import { onrampSessionRequestSchema, onrampSessionSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, assertRealTradingEnabled, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    assertSameOrigin(req);
    // M46: dinero real apagado (503 REAL_DISABLED sin tocar servicios).
    assertRealTradingEnabled();
    // Primera versión: sólo USDC en Solana. El depósito en pesos queda
    // apagado en servidor y falla cerrado (PESO_DEPOSITS_ENABLED=false),
    // aunque REAL_TRADING_READY se encienda. La implementación sigue intacta.
    if (PESO_DEPOSITS_ENABLED !== true) throw new DomainError("REAL_DISABLED");
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSession(services, req);
    const body = await parseJson(req, onrampSessionRequestSchema);
    const userLimited = await withRateLimit(req, "trade", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.onramp.createSession(body, session.userId));
    return readOutput(onrampSessionSchema, data);
  });
}
