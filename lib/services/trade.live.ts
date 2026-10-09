import "server-only";

import { Connection } from "@solana/web3.js";

import { USDC_MINT } from "@/config/tickers";
import { defaultSlippageBps, feeConfig, priceDeviationMaxBps } from "@/config/fees";
import { requireOperable } from "@/lib/catalog/tradable";
import { fetchMintMultiplier } from "@/lib/solana/scaled-ui";
import { serverEnv } from "@/lib/env";
import { DomainError } from "@/lib/api/result";
import { livePrices } from "@/lib/services/prices.live";
import { buildSwapParams, parsedOrderToTradeQuote } from "@/lib/market/jupiter-tx";
import { fetchJupiterOrder } from "@/lib/market/jupiter-client";
import { jupiterSwapUrl, jupiterOrderParams, parseJupiterOrder } from "@/lib/market/jupiter-order";
import { NETWORK_FEE_SOL, TOKEN_ACCOUNT_RENT_SOL } from "@/lib/wallet/send-cost";
import type {
  Order,
  TradeBuildResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeSubmitResponse,
} from "@/lib/types";

/**
 * Compra y venta live contra Jupiter Swap v2. El `quote` ya está conectado y
 * verificado contra la red real (AAPLx cotiza con precio de mercado). El
 * `build`/`submit`/`status` de dinero real siguen pendientes de la firma
 * on-chain (Privy + tx firmada); sus TODO exactos están en cada método.
 *
 * Flujo de compra: entra USDC, sale la acción. Venta: al revés. El `quote`
 * respeta el allowlist (`requireOperable`) y lee el multiplicador Token-2022
 * del mint por el RPC para convertir crudo <-> acciones.
 */

const QUOTE_TTL_MS = 60_000;
const USDC_DECIMALS = 6;
const STOCK_DECIMALS = 8;

/** Multiplicador vigente del mint. 1 si el RPC falla (nunca rompe el quote). */
async function multiplierOf(connection: Connection, mint: string): Promise<number> {
  try {
    return await fetchMintMultiplier(connection, mint);
  } catch {
    return 1;
  }
}

export const liveTrade = {
  /**
   * Cotiza en vivo contra Jupiter `/swap/v2/order`. Compra: USDC→acción.
   * El monto crudo de entrada se resuelve según la moneda: USDC directo;
   * acciones y CLP necesitan el precio/spot, que se pide antes a
   * `livePrices.list`. Devuelve un `TradeQuote` con costos y desviación.
   * Verificado contra la red: AAPLx cotiza con precio de mercado real.
   */
  async quote(request: TradeQuoteRequest): Promise<TradeQuote> {
    if (!(request.amount > 0) || !Number.isFinite(request.amount)) {
      throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
    }
    // Allowlist por lado (compra exige tradable; venta, existir con mint válido).
    const asset = await requireOperable(request.symbol, request.side);

    const needsSpot =
      request.amountCurrency === "SHARES" ||
      request.amountCurrency === "CLP" ||
      (request.side === "sell" && request.amountCurrency === "USDC");
    const [spot] = needsSpot
      ? await livePrices.list([asset.symbol])
      : [{ priceUsd: 0 } as { priceUsd: number }];
    const price = needsSpot && spot && spot.priceUsd > 0 ? spot.priceUsd : 0;

    // Conexión sólo para leer el multiplicador del mint (1 si falla).
    const rpcUrl = serverEnv.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const stockMultiplier = await multiplierOf(connection, asset.mint);

    const baseParams = {
      side: request.side,
      usdcMint: USDC_MINT,
      stockMint: asset.mint,
      stockDecimals: STOCK_DECIMALS,
      stockMultiplier,
      usdcDecimals: USDC_DECIMALS,
    } as const;

    let params;
    try {
      params = buildSwapParams({
        ...baseParams,
        amountCurrency: request.amountCurrency,
        amount: request.amount,
      });
    } catch {
      // Compra por acciones: el crudo de entrada (USDC) lo resuelve el spot.
      if (request.side === "buy" && request.amountCurrency === "SHARES" && price > 0) {
        params = buildSwapParams({
          ...baseParams,
          amountCurrency: request.amountCurrency,
          amountRaw: BigInt(Math.round((request.amount * price + Number.EPSILON) * 1e6)),
        });
      } else if (request.side === "buy" && request.amountCurrency === "CLP") {
        throw new DomainError("UPSTREAM", "Dólar no disponible para cotizar en CLP.");
      } else {
        throw new DomainError("VALIDATION", "Moneda o monto no soportados para cotizar.");
      }
    }

    const url = jupiterSwapUrl(serverEnv.JUPITER_BASE_URL, "/swap/v2/order");
    const query = jupiterOrderParams({
      side: request.side,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountRaw: params.amountRaw,
      slippageBps: defaultSlippageBps,
    });

    let body: unknown;
    try {
      body = await fetchJupiterOrder({
        url: `${url}?${query.toString()}`,
        base: serverEnv.JUPITER_BASE_URL,
        apiKey: serverEnv.JUPITER_API_KEY,
      });
    } catch (error) {
      throw new DomainError(
        "UPSTREAM",
        error instanceof Error ? error.message : "No pudimos cotizar en Jupiter.",
      );
    }

    const buy = request.side === "buy";
    let parsed;
    try {
      parsed = parseJupiterOrder(body as Parameters<typeof parseJupiterOrder>[0], {
        side: request.side,
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inputDecimals: buy ? USDC_DECIMALS : STOCK_DECIMALS,
        outputDecimals: buy ? STOCK_DECIMALS : USDC_DECIMALS,
        inputMultiplier: buy ? 1 : stockMultiplier,
        outputMultiplier: buy ? stockMultiplier : 1,
        platformFeeBps: feeConfig.bps,
      });
    } catch (error) {
      throw new DomainError(
        "UPSTREAM",
        error instanceof Error ? error.message : "Respuesta de Jupiter no válida.",
      );
    }

    // Desviación on-chain vs referencia (CATALOGO-SEGURIDAD §7). Con spot real.
    let priceDeviationBps = 0;
    if (needsSpot && price > 0) {
      priceDeviationBps = (Math.abs(parsed.pricePerShareUsd - price) / price) * 10_000;
    }

    const quote = parsedOrderToTradeQuote({
      parsed,
      side: request.side,
      symbol: asset.symbol,
      platformFeeBps: feeConfig.bps,
      networkFeeSol: NETWORK_FEE_SOL,
      tokenAccountRentSol: TOKEN_ACCOUNT_RENT_SOL,
      opensAccount: buy,
      priceDeviationBps,
      expiresInMs: QUOTE_TTL_MS,
    });

    if (buy && priceDeviationBps > priceDeviationMaxBps) {
      throw new DomainError("PRICE_DEVIATION");
    }
    return quote;
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
    throw new Error("NOT_IMPLEMENTED: armado de transacción live (llega con la firma on-chain)");
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
    throw new Error("NOT_IMPLEMENTED: envío live (llega con la firma on-chain)");
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
    throw new Error("NOT_IMPLEMENTED: estado live (llega con las órdenes en Supabase)");
  },
};
