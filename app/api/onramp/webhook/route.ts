import { PESO_DEPOSITS_ENABLED } from "@/config/onramp";
import { onrampWebhookResponseSchema } from "@/lib/api/contracts";
import { assertRealTradingEnabled, callService, handle, readOutput } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import {
  ONRAMP_SIGNATURE_HEADER,
  ONRAMP_TIMESTAMP_HEADER,
  claimOnrampSignature,
  releaseOnrampSignature,
  verifyOnrampWebhook,
} from "@/lib/onramp/webhook-auth";
import { getServices } from "@/lib/services";
import { realWithdrawalGuardDeps } from "@/lib/trade/real-guards";
import { assertOnrampEnabled } from "@/lib/trade/limits";

export const runtime = "nodejs";

/**
 * Sin firma HMAC verificada no se acredita (SEC-06, MON-9).
 * Se lee el cuerpo crudo, se verifica HMAC-SHA256 de `${timestamp}.${cuerpo}`
 * con ONRAMP_WEBHOOK_SECRET (ventana de 5 min, comparación en tiempo
 * constante, falla cerrado sin secreto) y recién entonces se llama al adaptador.
 * Además exige PESO_DEPOSITS_ENABLED=true y el kill switch `onramp_enabled`.
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
    // MON-9: kill switch de entrada de dinero (`onramp_enabled`), fail-closed.
    await assertOnrampEnabled(realWithdrawalGuardDeps());
    // El cuerpo crudo se lee ANTES de parsear JSON: la firma cubre los bytes.
    const rawBody = await req.text();
    const verdict = verifyOnrampWebhook({
      secret: serverEnv.ONRAMP_WEBHOOK_SECRET,
      signatureHeader: req.headers.get(ONRAMP_SIGNATURE_HEADER),
      timestampHeader: req.headers.get(ONRAMP_TIMESTAMP_HEADER),
      rawBody,
    });
    if (!verdict.ok) {
      throw new DomainError("VALIDATION", "El aviso del proveedor no es válido.");
    }
    // Repetición de la misma firma dentro de la ventana: ya procesada.
    if (!claimOnrampSignature(verdict.signature)) {
      return readOutput(onrampWebhookResponseSchema, { ok: true, already: true });
    }
    const verified = new Request(req.url, { method: "POST", headers: req.headers, body: rawBody });
    const services = getServices();
    let extra: Awaited<ReturnType<typeof services.onramp.handleWebhook>> | Record<string, never>;
    try {
      extra = (await callService(req, () => services.onramp.handleWebhook(verified))) ?? {};
    } catch (error) {
      // Sin acreditar: el reintento del proveedor debe poder entrar.
      releaseOnrampSignature(verdict.signature);
      throw error;
    }
    return readOutput(onrampWebhookResponseSchema, { ok: true, ...extra });
  });
}
