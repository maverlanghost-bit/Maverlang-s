/**
 * Mínimo por orden, en dólares. El cliente lo exige antes de cotizar.
 * US$ 1: por debajo, la comisión de red pesa más que la orden.
 */
export const MIN_TRADE_USD = 1;

/**
 * Tope por orden en la beta, en dólares (M56; M74 lo pasa a la base).
 * La API rechaza montos en USDC sobre este techo.
 */
export const MAX_ORDER_USD = 1000;

/** Espera tras el último cambio de monto antes de pedir cotización. */
export const QUOTE_DEBOUNCE_MS = 400;

/** Firma mock. En live, Privy firma con `signTransaction`. */
export const MOCK_SIGN_MS = 800;
