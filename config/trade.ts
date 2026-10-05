/**
 * Mínimo por orden, en dólares. El cliente lo exige antes de cotizar.
 * US$ 1: por debajo, la comisión de red pesa más que la orden.
 */
export const MIN_TRADE_USD = 1;

/** Espera tras el último cambio de monto antes de pedir cotización. */
export const QUOTE_DEBOUNCE_MS = 400;

/** Firma mock. En live, Privy firma con `signTransaction`. */
export const MOCK_SIGN_MS = 800;
