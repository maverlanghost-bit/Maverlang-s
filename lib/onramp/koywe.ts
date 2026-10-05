import { launchSession, type OnrampAdapter } from "@/lib/onramp/launch";

/**
 * Koywe, proveedor principal.
 * En live abre el SDK `@koyweforest/koywe-ramp-sdk` o la URL de la sesión (ARQUITECTURA §10).
 */
export const koyweAdapter: OnrampAdapter = {
  id: "koywe",
  launch: launchSession,
};
