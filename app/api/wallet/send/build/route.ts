import { sendBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, assertRealTradingEnabled, callService, handle, readOutput, requireMint, requireSupabaseUser } from "@/lib/api/handler";
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
    // La validación de dirección de la pantalla Enviar es del cliente y sigue igual.
    assertRealTradingEnabled();
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    const userLimited = session
      ? await withRateLimit(req, "trade", [session.userId])
      : await withRateLimit(req, "trade");
    if (userLimited) return userLimited;
    const body = await parseJson(req, sendBuildRequestSchema);
    const mint = requireMint(body.mint);
    const data = await callService(req, () => services.portfolio.sendBuild({ ...body, mint }));
    return readOutput(tradeBuildResponseSchema, data);
  });
}
