import "server-only";

import { Connection } from "@solana/web3.js";

import { USDC_MINT } from "@/config/tickers";
import { defaultSlippageBps, feeConfig, priceDeviationMaxBps } from "@/config/fees";
import { requireOperable } from "@/lib/catalog/tradable";
import { fetchMintMultiplier } from "@/lib/solana/scaled-ui";
import { serverEnv } from "@/lib/env";
import { DomainError } from "@/lib/api/result";
import { livePrices } from "@/lib/services/prices.live";
import {
  findOrderByRequestId,
  getOrderById,
  insertOrder,
  updateOrderStatus,
} from "@/lib/services/orders.supabase";
import { buildSwapParams, parsedOrderToTradeQuote } from "@/lib/market/jupiter-tx";
import { fetchJupiterOrder } from "@/lib/market/jupiter-client";
import { jupiterSwapUrl, jupiterOrderParams, parseJupiterOrder } from "@/lib/market/jupiter-order";
import { parseJupiterExecute } from "@/lib/market/jupiter-order";
import { NETWORK_FEE_SOL, TOKEN_ACCOUNT_RENT_SOL } from "@/lib/wallet/send-cost";
import type {
  Order,
  TradeBuildRequest,
  TradeBuildResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeSubmitRequest,
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

/**
 * Cotizaciones live guardadas para poder armar la tx en `build`. La
 * cotización de Jupiter sin `taker` no trae transacción: hay que re-pedirla
 * con la billetera del usuario. Guardamos los parámetros crudos del swap
 * (mints, monto, lado) keyed por `requestId` de Jupiter. En memoria del
 * servidor: una cotización vive lo que dura el checkout (TTL de la quote).
 * Igual que el servicio demo, pero acá el `requestId` es el de Jupiter.
 */
interface StoredLiveQuote {
  requestId: string;
  side: "buy" | "sell";
  symbol: string;
  mint: string;
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  priceUsd: number;
  expiresAt: string;
}

const liveQuotes = new Map<string, StoredLiveQuote>();

/** Limpia cotizaciones vencidas. Se llama en cada quote/build nuevo. */
function pruneLiveQuotes(now: number): void {
  for (const [id, stored] of liveQuotes) {
    if (Date.parse(stored.expiresAt) <= now) liveQuotes.delete(id);
  }
}

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

    // Guardamos los parámetros crudos del swap para armar la tx en `build`
    // (Jupiter necesita re-cotizar con el `taker` para devolver la tx armada).
    pruneLiveQuotes(Date.now());
    liveQuotes.set(quote.id, {
      requestId: quote.id,
      side: request.side,
      symbol: asset.symbol,
      mint: asset.mint,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountRaw: params.amountRaw,
      priceUsd: quote.pricePerShareUsd,
      expiresAt: quote.expiresAt,
    });

    return quote;
  },

  /**
   * Arma la transacción sin firmar. Camino Meta-Aggregator de Jupiter
   * (`/swap/v2/order` + `/execute`): recuperamos los parámetros crudos del
   * swap guardados en `quote` y volvemos a pedir la orden a Jupiter, esta vez
   * con `taker` = la billetera del usuario. Con `taker`, Jupiter devuelve la
   * transacción ya armada en base64. La firma la hace el cliente con Privy.
   *
   * Errores: cotización vencida o desconocida → QUOTE_EXPIRED; sin billetera
   * → VALIDATION; Jupiter no pudo armar la tx (transaction vacía) → UPSTREAM;
   * red → UPSTREAM.
   */
  async build(request: TradeBuildRequest): Promise<TradeBuildResponse> {
    const userPublicKey = request.userPublicKey?.trim() ?? "";
    if (userPublicKey.length < 32) {
      throw new DomainError("VALIDATION", "Falta la billetera para operar.");
    }
    const stored = liveQuotes.get(request.quoteId);
    if (!stored || Date.parse(stored.expiresAt) <= Date.now()) {
      throw new DomainError("QUOTE_EXPIRED", "La cotización venció. Pide una nueva.");
    }

    // Re-cotizamos con el taker para obtener la transacción armada.
    const url = jupiterSwapUrl(serverEnv.JUPITER_BASE_URL, "/swap/v2/order");
    const query = jupiterOrderParams({
      side: stored.side,
      inputMint: stored.inputMint,
      outputMint: stored.outputMint,
      amountRaw: stored.amountRaw,
      slippageBps: defaultSlippageBps,
      taker: userPublicKey,
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
        error instanceof Error ? error.message : "No pudimos armar la operación.",
      );
    }

    const order = body as { transaction?: string | null; requestId?: string };
    const transaction = typeof order.transaction === "string" ? order.transaction : "";
    if (!transaction) {
      // Jupiter cotizó pero no pudo armar la tx (ver errorCode en la respuesta).
      throw new DomainError("UPSTREAM", "Jupiter no pudo armar la transacción.");
    }
    // La tx armada puede traer un requestId nuevo; si no, reusamos el de la quote.
    const requestId = typeof order.requestId === "string" && order.requestId ? order.requestId : stored.requestId;
    // Guardamos la cotización también bajo el requestId devuelto, para que
    // `submit` la recupere aunque Jupiter haya asignado uno distinto al armar la tx.
    if (requestId !== stored.requestId) liveQuotes.set(requestId, stored);

    return {
      requestId,
      transactionBase64: transaction,
      expiresAt: stored.expiresAt,
    };
  },

  /**
   * Envía la transacción firmada a Jupiter `/swap/v2/execute` y guarda la
   * orden en Supabase (`orders`). Jupiter aterriza la transacción; acá sólo
   * la firmó el cliente con Privy, este método no vuelve a firmar.
   *
   * Idempotencia: si el mismo `requestId` ya quedó `submitted`, se devuelve
   * la orden existente sin volver a ejecutar (evita doble gasto).
   *
   * Errores: requestId desconocido → NOT_FOUND; tx vacía → VALIDATION; red →
   * UPSTREAM. Firma rechazada por Jupiter → status `failed` (no UPSTREAM).
   */
  async submit(request: TradeSubmitRequest, userId: string): Promise<TradeSubmitResponse> {
    const signedTransactionBase64 = request.signedTransactionBase64?.trim() ?? "";
    if (!signedTransactionBase64) {
      throw new DomainError("VALIDATION", "Falta la transacción firmada.");
    }
    const stored = liveQuotes.get(request.requestId);
    if (!stored) {
      throw new DomainError("NOT_FOUND", "No encontramos esa operación.");
    }

    // Idempotencia: si ya hay una orden viva con este requestId, no repetir.
    const existing = await findOrderByRequestId(userId, request.requestId);
    if (existing && existing.status !== "failed") {
      return { orderId: existing.id, signature: existing.signature, status: existing.status };
    }

    // Ejecutamos contra Jupiter.
    const executeUrl = jupiterSwapUrl(serverEnv.JUPITER_BASE_URL, "/swap/v2/execute");
    let result: { status: "submitted" | "failed"; signature: string | null; error?: string };
    try {
      const response = await fetch(executeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": serverEnv.JUPITER_API_KEY ?? "",
        },
        body: JSON.stringify({
          signedTransaction: signedTransactionBase64,
          requestId: request.requestId,
        }),
      });
      const body = (await response.json()) as unknown;
      result = parseJupiterExecute(body as Parameters<typeof parseJupiterExecute>[0]);
    } catch (error) {
      throw new DomainError(
        "UPSTREAM",
        error instanceof Error ? error.message : "No pudimos enviar la operación.",
      );
    }

    const orderStatus: Order["status"] = result.status === "submitted" ? "submitted" : "failed";
    const inserted = await insertOrder({
      userId,
      requestId: request.requestId,
      side: stored.side,
      symbol: stored.symbol,
      mint: stored.mint,
      priceUsd: stored.priceUsd,
      feeBps: feeConfig.bps,
      status: orderStatus,
      signature: result.signature,
      error: result.error ?? null,
    });
    if (!inserted) {
      // Jupiter ya la ejecutó pero no pudimos guardar: devolvemos el estado
      // sin orderId; el polling por requestId la recupera.
      return { orderId: "", signature: result.signature, status: orderStatus };
    }
    return { orderId: inserted.id, signature: result.signature, status: orderStatus };
  },

  /**
   * Estado de una orden real. Lee la fila de `orders` en Supabase y, si sigue
   * abierta, confirma en cadena con `getSignatureStatuses`. No pisa un
   * `confirmed` con un fallo transitorio del RPC (devuelve el guardado).
   *
   * Errores: id ajeno o inexistente → NOT_FOUND. RPC caído al confirmar →
   * devuelve la orden guardada tal cual (no UPSTREAM: el cliente sigue
   * pollenado y la confirmación llega en el siguiente tick).
   */
  async status(id: string): Promise<Order> {
    const data = await getOrderById(id);
    if (!data) {
      throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
    }

    let status = data.status;
    // Si sigue abierta y tenemos firma, confirmamos contra la cadena.
    if ((status === "submitted" || status === "pending") && data.signature) {
      const rpcUrl = serverEnv.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      try {
        const { value } = await connection.getSignatureStatuses([data.signature]);
        const onchain = value[0];
        if (onchain) {
          const confirmed = onchain.confirmationStatus === "finalized" || onchain.confirmationStatus === "confirmed";
          const failed = Boolean(onchain.err);
          const next: Order["status"] = failed ? "failed" : confirmed ? "confirmed" : status;
          if (next !== status) {
            status = next;
            await updateOrderStatus(id, next as "confirmed" | "failed");
          }
        }
      } catch {
        // RPC caído: devolvemos lo guardado, sin pisar el status.
      }
    }

    return {
      id: data.id,
      userId: data.user_id,
      side: data.side,
      symbol: data.symbol,
      inAmountUi: Number(data.in_amount_ui ?? 0),
      outAmountUi: Number(data.out_amount_ui ?? 0),
      feeBps: Number(data.fee_bps ?? 0),
      status,
      signature: data.signature,
      error: data.error ?? undefined,
      createdAt: data.created_at,
    };
  },
};
