import "server-only";

import type { OnrampSession } from "@/lib/types";

/**
 * TODO: sesión Onramper con ONRAMPER_API_KEY (ARQUITECTURA §10).
 * handleWebhook: verificar la firma del proveedor antes de acreditar.
 */
export const onramperOnramp = {
  async createSession(): Promise<OnrampSession> {
    throw new Error("NOT_IMPLEMENTED: sesión Onramper");
  },
  async handleWebhook(): Promise<void> {
    throw new Error("NOT_IMPLEMENTED: webhook Onramper");
  },
};
