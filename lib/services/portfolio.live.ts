import "server-only";

import type { Activity, Balance, Portfolio, TradeBuildResponse } from "@/lib/types";

/**
 * Cartera live. No consulta la cadena: cada método lanza NOT_IMPLEMENTED.
 * Conexión: `getServerConnection()` (ARQUITECTURA §10).
 */
export const livePortfolio = {
  /**
   * TODO cartera.
   * Cadena: `getTokenAccountsByOwner` con TOKEN_2022_PROGRAM_ID (acciones) y con
   *   TOKEN_PROGRAM_ID (USDC). SOL con `getBalance`. Precios: `prices.live`.
   * Parámetros: address de la billetera (32 bytes). Cuentas cuyo mint no esté en
   *   `classifyMint` como `stock` o `usdc` se ignoran (un mint falso no entra).
   *   `disabled` tampoco se opera; si hay saldo, no se muestra como posición operable.
   * Mapeo a Portfolio: shares = `rawToShares(raw, decimals, fetchMintMultiplier)`;
   *   USDC ui = raw / 10^6; valueUsd con el precio por acción; cashUsdc; totalUsd;
   *   pnlUsd y pnlPct null si no hay costo medio (la cadena no lo guarda: sale de `orders`).
   *   Nunca devolver el crudo como cantidad visible. `rawAmount` sí va, como string.
   * Errores: address inválida → VALIDATION. RPC → UPSTREAM. Precio ausente: la posición queda
   *   sin valueUsd inventado (0 y el caller lo trata como dato faltante, no como precio cero real).
   * Cache: no en el servidor. El cliente refresca la cartera al operar.
   */
  async get(): Promise<Portfolio> {
    throw new Error("NOT_IMPLEMENTED: cartera on-chain");
  },

  /**
   * TODO saldos.
   * Misma lectura que `get`: Token-2022, USDC y SOL nativo.
   * Mapeo a Balance[]: mint, symbol (o "USDC" / "SOL"), rawAmount string, uiAmount, valueUsd.
   *   SOL no es enviable. Su uiAmount es lamports / 10^9. valueUsd desde el precio de SOL
   *   (mint nativo envuelto en Jupiter) ÷ nada: SOL no tiene multiplicador de acción.
   * Errores: address inválida → VALIDATION. RPC o Jupiter → UPSTREAM.
   * Cache: la de precios (15 s). Los saldos, no.
   */
  async balances(): Promise<Balance[]> {
    throw new Error("NOT_IMPLEMENTED: getTokenAccountsByOwner");
  },

  /**
   * TODO actividad.
   * Dos fuentes: filas `orders` del usuario (buy/sell) y firmas de la address
   *   (`getSignaturesForAddress`) para send/receive. El proveedor de parseo de esas
   *   firmas está [POR DEFINIR]: no adivinar el tipo de instrucción.
   * Mapeo a Activity: kind, symbol, amountUi (ya con multiplicador), valueUsd, status, signature, at.
   * Errores: address inválida → VALIDATION. Supabase o RPC → UPSTREAM. Sin filas → lista vacía, no un error.
   * Cache: no.
   */
  async activity(): Promise<Activity[]> {
    throw new Error("NOT_IMPLEMENTED: actividad on-chain / orders");
  },

  /**
   * TODO armar un envío.
   * Parámetros: to, mint, amountUi, userPublicKey. `isValidSolanaAddress` en las dos claves.
   *   `classifyMint`: `unknown`, `sol` o `disabled` → MINT_NOT_ALLOWED. `stock` usa Token-2022;
   *   `usdc` usa el programa clásico. amountUi → crudo con `sharesToRaw` (USDC: × 10^6, multiplicador 1).
   * Mapeo a TradeBuildResponse: transacción de transferencia (ATA destino idempotente) en base64,
   *   sin firmar. requestId propio. La firma y el débito ocurren en submit, como en el mock.
   * Errores: destino = origen → VALIDATION. Saldo insuficiente → INSUFFICIENT_FUNDS.
   *   Renta de ATA (~0,0016 SOL) se muestra; no se patrocina (`sponsor.ts`, requiere KMS).
   * Cache: no.
   */
  async sendBuild(): Promise<TradeBuildResponse> {
    throw new Error("NOT_IMPLEMENTED: transferencia SPL Token-2022 o USDC");
  },
};
