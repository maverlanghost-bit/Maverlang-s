import "server-only";

import type { Order, TradeBuildResponse, TradeQuote, TradeSubmitResponse } from "@/lib/types";

/**
 * Compra y venta live. No llama a Jupiter: cada método lanza NOT_IMPLEMENTED.
 * Ultra y Swap V2 comparten `/order` y `/execute` (ARQUITECTURA §1 y §10).
 * Base: {JUPITER_BASE_URL}. Header `x-api-key`: JUPITER_API_KEY.
 * Para insertar la comisión hace falta armar la transacción nosotros:
 * GET /swap/v2/build devuelve instrucciones; /ultra/v1/order ya viene armada
 * y puede rechazar una instrucción extra. [VERIFICAR al enchufar].
 */
export const liveTrade = {
  /**
   * TODO cotizar.
   * Endpoint: GET {JUPITER_BASE_URL}/swap/v2/order
   *   (o /ultra/v1/order si no hace falta reescribir la tx).
   * Parámetros: inputMint, outputMint (USDC_MINT y el mint del símbolo; el lado invierte),
   *   amount en unidades crudas del mint de entrada (`sharesToRaw` si el usuario pidió acciones),
   *   slippageBps = DEFAULT_SLIPPAGE_BPS. Sin `taker`: cotización, sin transacción.
   *   Sólo mints de `operableMints()`.
   * Mapeo a TradeQuote: inAmountUi / outAmountUi ya en acciones o USDC (÷ 10^decimals × multiplicador);
   *   pricePerShareUsd = usdPrice de Jupiter (ya es por acción; no dividir de nuevo); costs.platformFeeBps = FEE_BPS y
   *   platformFeeUsd desde `computeFee` (bps 0 → 0 USD); priceImpactPct y slippageBps de la respuesta;
   *   priceDeviationBps contra el precio de `prices.live`; route "jupiter";
   *   expiresAt ≈ 60 s; id = requestId de Jupiter o uno propio si la orden no trae tx.
   * Errores: desviación > PRICE_DEVIATION_MAX_BPS → PRICE_DEVIATION. Mint ajeno → MINT_NOT_ALLOWED.
   *   Red, 401 o 429 → UPSTREAM. Monto que no alcanza → INSUFFICIENT_FUNDS.
   * Cache: no. La cotización vence sola.
   */
  async quote(): Promise<TradeQuote> {
    throw new Error("NOT_IMPLEMENTED: Jupiter /order");
  },

  /**
   * TODO armar la transacción.
   * Endpoint: GET {JUPITER_BASE_URL}/swap/v2/build (instrucciones) con taker = userPublicKey.
   *   Si FEE_BPS > 0 y `computeFee` no es null ni 0, agregar `buildFeeTransferIx({ from: taker, feeWallet: FEE_WALLET, amount })`.
   *   FEE_WALLET vacío con FEE_BPS > 0 → INTERNAL. No patrocinar el fee-payer: `sponsor.ts` sigue en NOT_IMPLEMENTED (requiere KMS).
   * Mapeo a TradeBuildResponse: requestId, transactionBase64 de la tx sin firmar, expiresAt de la cotización.
   * Errores: cotización vencida → QUOTE_EXPIRED. El mismo guardia de precio que en quote. Red → UPSTREAM.
   * Cache: no. Una cotización, una transacción.
   */
  async build(): Promise<TradeBuildResponse> {
    throw new Error("NOT_IMPLEMENTED: Jupiter /order (transacción)");
  },

  /**
   * TODO enviar la tx firmada.
   * Endpoint: POST {JUPITER_BASE_URL}/swap/v2/execute
   *   (Ultra: POST /ultra/v1/execute). Body: `{ signedTransaction, requestId }`.
   *   La firma la hizo la billetera (Privy). Este método no vuelve a firmar.
   * Mapeo a TradeSubmitResponse: orderId de la fila `orders`, signature, status
   *   `submitted` si Jupiter dice Success, `failed` si Failed.
   *   Guardar en `orders`: userId, side, symbol, mint, montos, fee_bps, signature, status.
   * Errores: requestId desconocido o tx que no coincide → VALIDATION. Firma rechazada → el status failed, no UPSTREAM.
   *   Red → UPSTREAM. No acreditar la orden dos veces si el mismo requestId ya está `submitted`.
   * Cache: no.
   */
  async submit(): Promise<TradeSubmitResponse> {
    throw new Error("NOT_IMPLEMENTED: Jupiter /execute");
  },

  /**
   * TODO estado.
   * Endpoint: no es Jupiter. Leer `orders` en Supabase por id (service role).
   *   Confirmar en cadena con `getSignatureStatuses` sólo si el status guardado sigue abierto.
   * Mapeo a Order: las columnas de `orders` (status, signature, error, montos, fee_bps, created_at).
   * Errores: id ajeno o inexistente → NOT_FOUND. RPC caído al confirmar → UPSTREAM y no pisar un `confirmed`.
   * Cache: no. El cliente hace polling.
   */
  async status(): Promise<Order> {
    throw new Error("NOT_IMPLEMENTED: estado de orden en Supabase");
  },
};
