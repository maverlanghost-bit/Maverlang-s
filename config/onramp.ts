/**
 * Piso en pesos del depósito.
 * [VERIFICAR] con Koywe y Onramper antes de producción: este número no está confirmado.
 * Los chips de la pantalla parten en este mismo piso.
 */
export const ONRAMP_MIN_CLP = 10_000;

export const ONRAMP_CHIPS_CLP = [10_000, 50_000, 100_000] as const;

/** Espera tras el último monto antes de pedir la sesión (estimado y costo). */
export const ONRAMP_DEBOUNCE_MS = 400;

/**
 * Métodos que el proveedor muestra en Chile. La app no los cobra.
 * [VERIFICAR en Koywe] antes de producción.
 */
export const ONRAMP_METHOD_IDS = ["khipu", "etpay", "transfer"] as const;

export type OnrampMethodId = (typeof ONRAMP_METHOD_IDS)[number];
