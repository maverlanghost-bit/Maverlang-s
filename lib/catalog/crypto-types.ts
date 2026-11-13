/**
 * Tipos del catálogo de criptos de Maverlang (CRIPTO_F1, K1).
 * Módulo puro: puede importarse desde cliente y servidor.
 * Sin I/O, sin `server-only`, sin variables de entorno.
 */

/** Sello de riesgo del token, visible en la lista y en la ficha. */
export type CryptoSeal = "VERDE" | "AMARILLO";

/**
 * Grupo de la lista: cripto, dólares (monedas estables) u oro.
 * Las monedas estables y el oro se muestran en un grupo aparte de Cripto.
 */
export type CryptoGroup = "crypto" | "dollar" | "gold";

export interface CryptoAsset {
  /** Símbolo canónico de Maverlang (BTC, USDe, XAUt0, …). */
  symbol: string;
  name: string;
  /** Mint exacto en Solana (base58, distingue mayúsculas y minúsculas). */
  mint: string;
  /** Decimales del mint; `null` si no se confirmaron (ese token no se cotiza). */
  decimals: number | null;
  seal: CryptoSeal;
  group: CryptoGroup;
  /** Versión / origen en Solana (p. ej. "cbBTC (Coinbase)", "SOL nativo"). */
  originLabel: string;
  /** Tope por orden en USD, en el nocional de la compra. */
  maxOrderUsd: number;
  /** Programa del token; si falta, se usa la ruta que detecta el multiplicador. */
  tokenProgram?: "spl" | "token-2022";
}
