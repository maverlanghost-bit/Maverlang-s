import "server-only";

import type { OnrampSession } from "@/lib/types";

/**
 * TODO: sesión Koywe con @koyweforest/koywe-ramp-sdk (ARQUITECTURA §10).
 * Credenciales: KOYWE_CLIENT_ID y KOYWE_SECRET, sólo servidor.
 * handleWebhook: verificar la firma con KOYWE_WEBHOOK_SECRET antes de acreditar USDC.
 */
export const koyweOnramp = {
  async createSession(): Promise<OnrampSession> {
    throw new Error("NOT_IMPLEMENTED: sesión Koywe");
  },
  async handleWebhook(): Promise<void> {
    throw new Error("NOT_IMPLEMENTED: webhook Koywe");
  },
};
