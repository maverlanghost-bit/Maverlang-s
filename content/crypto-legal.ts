/**
 * Textos legales de criptos y staking (CRIPTO_F1, K3).
 * Borrador pendiente de revisión legal: [REVISIÓN ABOGADO].
 *
 * Son constantes de texto EXACTAS de §1.1, §1.8 y §1.13 del encargo: no se
 * editan, no se les agrega nada y no se envuelven en JSX. La UI (Cripto,
 * ficha y Ganar) las muestra tal cual. Este módulo no tiene lógica ni I/O.
 */

/**
 * §1.8 — Texto visible en Ganar y en cada ficha de LST.
 * El rendimiento está en SOL, no en dólares, y no es una promesa.
 */
export const LST_YIELD_NOTICE =
  "El rendimiento está en SOL: estos tokens suelen valer más SOL con el tiempo, pero no es una promesa ni un ahorro garantizado. Puede bajar. Esto es una demo con saldo ficticio.";

/**
 * §1.8 — Aviso adicional para USDY en Ganar (bono de Ondo, rendimiento en
 * dólares y restricción para personas de EE.UU.).
 */
export const USDY_YIELD_NOTICE =
  "USDY es un bono tokenizado de Ondo. El rendimiento, cuando hay dato, está en dólares. No está disponible para personas de EE.UU. Esto es una demo con saldo ficticio.";

/** §1.13 — Línea común de no custodia (no reemplaza las frases ya existentes de la portada). */
export const NON_CUSTODY_LINE = "Maverlang no custodia tus activos.";

/** §1.13 — Aviso de token puenteado: viven en Solana y no son el activo nativo de su red. */
export const BRIDGED_TOKEN_NOTICE =
  "Estas criptos viven en Solana. Si vienen de otra red, lo verás en la ficha (por ejemplo Bitcoin como cbBTC de Coinbase). No son el activo nativo de esa otra red.";

/** §1.13 — Aviso de revisión legal antes de habilitar dinero real. */
export const LEGAL_REVIEW_NOTICE = "Antes de usar dinero real necesitamos la opinión de un abogado.";

/**
 * §1.1 — Error de dominio `VALIDATION` cuando una cuenta real intenta
 * cotizar, armar o enviar una cripto o un LST. Es el texto exacto que usa G4.
 */
export const CRYPTO_REAL_BLOCK_MESSAGE =
  "La compra de criptos y el staking están solo en la demo hasta una revisión legal.";
