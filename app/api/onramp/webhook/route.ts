import { PESO_DEPOSITS_ENABLED } from "@/config/onramp";
import { onrampWebhookResponseSchema } from "@/lib/api/contracts";
import { assertRealTradingEnabled, callService, handle, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/**
 * Sin firma HMAC verificada no se acredita (SEC-06).
 * En producción se rechaza antes de llamar al adaptador: ninguno verifica
 * la firma todavía. Fuera de producción el mock puede liquidar la demo,
 * sólo si el depósito en pesos está habilitado (PESO_DEPOSITS_ENABLED=true).
 */
export function POST(req: Request) {
  return handle("no-store", async () => {
    const geo = apiOperateBlock(req);
    if (geo) return geo;
    // M46: exento de Origin (firma propia) y primero el 503: dinero real
    // apagado (REAL_DISABLED sin tocar servicios).
    assertRealTradingEnabled();
    const ipLimited = await withRateLimit(req, "webhook");
    if (ipLimited) return ipLimited;
    // Primera versión: sólo USDC en Solana. El aviso del on-ramp en pesos
    // queda apagado en servidor y falla cerrado (PESO_DEPOSITS_ENABLED=false),
    // aunque REAL_TRADING_READY se encienda. No se acredita nada.
    if (PESO_DEPOSITS_ENABLED !== true) {
      throw new DomainError("VALIDATION", "El aviso del proveedor no es válido.");
    }
    if (process.env.NODE_ENV === "production") {
      throw new DomainError("VALIDATION", "El aviso del proveedor no es válido.");
    }
    const services = getServices();
    const extra = (await callService(req, () => services.onramp.handleWebhook(req))) ?? {};
    return readOutput(onrampWebhookResponseSchema, { ok: true, ...extra });
  });
}
