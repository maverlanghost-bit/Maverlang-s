import { launchSession, type OnrampAdapter } from "@/lib/onramp/launch";

/**
 * Onramper, opción secundaria ("Otros métodos").
 * Misma interfaz que Koywe. En live abre la URL o el SDK de la sesión.
 */
export const onramperAdapter: OnrampAdapter = {
  id: "onramper",
  launch: launchSession,
};
