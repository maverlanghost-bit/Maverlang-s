import { onrampWebhookResponseSchema } from "@/lib/api/contracts";
import { assertRealTradingEnabled, callService, handle, readOutput } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/** La firma la verifica el adaptador live. El mock acredita la sesión. */
export function POST(req: Request) {
  return handle("no-store", async () => {
    // M46: exento de Origin (firma propia) y primero el 503: dinero real
    // apagado (REAL_DISABLED sin tocar servicios).
    assertRealTradingEnabled();
    const ipLimited = await withRateLimit(req, "webhook");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const extra = (await callService(req, () => services.onramp.handleWebhook(req))) ?? {};
    return readOutput(onrampWebhookResponseSchema, { ok: true, ...extra });
  });
}
