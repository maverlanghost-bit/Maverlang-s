import "server-only";

import type { OnrampSession } from "@/lib/types";

/**
 * TODO on-ramp Koywe (ARQUITECTURA §10). No llama a la red. El SDK `@koyweforest/koywe-ramp-sdk` no está instalado.
 * Auth: client credentials con KOYWE_CLIENT_ID y KOYWE_SECRET, sólo en servidor.
 * Quote: POST {host}/api/v1/organizations/{orgId}/merchants/{merchantId}/quotes
 *   [VERIFICAR host de producción y de dónde salen orgId y merchantId: el env no los trae].
 *   Body: orderType ONRAMP, executable true, originCurrencySymbol CLP, destinationCurrencySymbol USDC,
 *   amountIn, network SOLANA.
 * Deal: POST .../deals { destinationAccountId, quoteId }. La wallet del usuario es la cuenta SOLANA.
 * Mapeo a OnrampSession: id del deal, provider "koywe", mode "widget_url" si hay URL de pago
 *   (si no, "sdk"), estimatedUsdc = finalAmountOut, feeClp = fee del quote, expiresAt con validForSeconds.
 * Webhook: verificar la firma con KOYWE_WEBHOOK_SECRET antes de acreditar.
 *   Eventos deal.completed / order.completed con type ONRAMP. Idempotencia por provider_ref en onramp_sessions.
 * Errores: firma inválida → no acreditar (VALIDATION). Red → UPSTREAM. Monto bajo el mínimo → VALIDATION.
 * Cache: no. La cotización vence con el quote.
 */
export const koyweOnramp = {
  async createSession(): Promise<OnrampSession> {
    throw new Error("NOT_IMPLEMENTED: sesión Koywe");
  },
  async handleWebhook(): Promise<void> {
    throw new Error("NOT_IMPLEMENTED: webhook Koywe");
  },
};
