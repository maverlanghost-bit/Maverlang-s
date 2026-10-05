import "server-only";

import type { OnrampSession } from "@/lib/types";

/**
 * TODO on-ramp Onramper (ARQUITECTURA §10). No llama a la red.
 * createSession: widgetUrl con ONRAMPER_API_KEY sólo en servidor. La URL pública no lleva el secret del webhook.
 *   Parámetros [VERIFICAR]: defaultFiat CLP, USDC en Solana, wallets = la address de la sesión, onlyCryptos.
 *   Mapeo: mode "widget_url", provider "onramper". estimatedUsdc y feeClp salen del quote del proveedor
 *   si el servidor lo pide; si el widget cotiza solo, no inventar el monto.
 * handleWebhook: verificar la firma del header [VERIFICAR] antes de acreditar.
 *   El env tiene ONRAMPER_API_KEY y no un secret de webhook distinto. Idempotencia por la referencia del proveedor.
 * Errores: firma mala → no acreditar. Red → UPSTREAM.
 * Cache: no.
 */
export const onramperOnramp = {
  async createSession(): Promise<OnrampSession> {
    throw new Error("NOT_IMPLEMENTED: sesión Onramper");
  },
  async handleWebhook(): Promise<void> {
    throw new Error("NOT_IMPLEMENTED: webhook Onramper");
  },
};
