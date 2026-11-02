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
  claimOrderExecution,
  finalizeOrderExecution,
  getOrderById,
  getOrderByIdForUser,
  updateOrderStatus,
} from "@/lib/services/orders.supabase";
import { translateSolanaError } from "@/lib/solana/tx-errors";
import { buildSwapParams, parsedOrderToTradeQuote } from "@/lib/market/jupiter-tx";
import { fetchJupiterOrder } from "@/lib/market/jupiter-client";
import { jupiterSwapUrl, jupiterOrderParams, parseJupiterOrder } from "@/lib/market/jupiter-order";
import { parseJupiterExecute } from "@/lib/market/jupiter-order";
import {
  assertBuiltAmountsMatch,
  assertQuoteIntegrity,
  assertSignedTransactionMatchesBuilt,
  computeNotionalUsd,
} from "@/lib/trade/integrity";
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
 * Compra y venta live contra Jupiter Swap v2. `quote` cotiza con precio de
 * mercado; `build` arma la tx con el `taker`; `submit` la envía firmada por
 * el cliente (Privy) y `status` concilia la fila con la cadena.
 *
 * Reglas de staging: una cotización pertenece a un usuario (build/submit
 * rechazan un id ajeno), `submit` reclama la orden en Supabase antes de
 * enviar (idempotencia real) y cualquier fallo de RPC/base que impida
 * verificar precios o registrar la orden falla cerrado. Nada de precios
 * inventados ni ejecución sin traza.
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
  /** Dueño de la cotización. `null` sólo en entornos sin sesión (mock/dev). */
  userId: string | null;
  side: "buy" | "sell";
  symbol: string;
  mint: string;
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  priceUsd: number;
  inAmountUi: number;
  outAmountUi: number;
  feeBps: number;
  feeUsd: number;
  expiresAt: string;
  /** Decimales/multiplicadores del cruce: se re-parsea el build con ellos. */
  inputDecimals: number;
  outputDecimals: number;
  inputMultiplier: number;
  outputMultiplier: number;
  /**
   * Una cotización se arma UNA sola vez. La reserva se toma antes de pedir
   * la tx a Jupiter para que dos builds simultáneos no generen dos txs
   * firmables de la misma operación.
   */
  built: boolean;
  /**
   * Transacción sin firmar que devolvió Jupiter en `build`. En `submit` se
   * compara con la firmada: mismo mensaje, firma distinta. Sin esto un
   * requestId válido podría firmar otra operación.
   */
  builtTransactionBase64: string | null;
}

const liveQuotes = new Map<string, StoredLiveQuote>();

/** Limpia cotizaciones vencidas. Se llama en cada quote/build nuevo. */
function pruneLiveQuotes(now: number): void {
  for (const [id, stored] of liveQuotes) {
    if (Date.parse(stored.expiresAt) <= now) liveQuotes.delete(id);
  }
}

/**
 * Una cotización con dueño sólo la puede usar ese usuario. Sin dueño (rutas
 * sin sesión en mock/dev) se mantiene el comportamiento anterior.
 */
function quoteOwnedBy(stored: StoredLiveQuote, userId?: string): boolean {
  return stored.userId === null || stored.userId === userId;
}

/**
 * Multiplicador vigente del mint. Si el RPC falla NO se asume 1: un
 * multiplicador inventado cambiaría las acciones y el precio. Falla cerrado.
 */
async function multiplierOf(connection: Connection, mint: string): Promise<number> {
  try {
    return await fetchMintMultiplier(connection, mint);
  } catch {
    throw new DomainError(
      "UPSTREAM",
      "No pudimos verificar el activo en la red. Intenta de nuevo en un momento.",
    );
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
  async quote(request: TradeQuoteRequest, userId?: string): Promise<TradeQuote> {
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

    // Integridad: montos/precio finitos y vencimiento futuro. Una cotización
    // corrupta no se guarda ni llega a la reserva de cupo.
    assertQuoteIntegrity({
      inAmountUi: quote.inAmountUi,
      outAmountUi: quote.outAmountUi,
      pricePerShareUsd: quote.pricePerShareUsd,
      expiresAt: quote.expiresAt,
      platformFeeUsd: quote.costs.platformFeeUsd,
    });

    // Guardamos los parámetros crudos del swap para armar la tx en `build`
    // (Jupiter necesita re-cotizar con el `taker` para devolver la tx armada).
    pruneLiveQuotes(Date.now());
    liveQuotes.set(quote.id, {
      requestId: quote.id,
      userId: userId ?? null,
      side: request.side,
      symbol: asset.symbol,
      mint: asset.mint,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountRaw: params.amountRaw,
      priceUsd: quote.pricePerShareUsd,
      inAmountUi: quote.inAmountUi,
      outAmountUi: quote.outAmountUi,
      feeBps: quote.costs.platformFeeBps,
      feeUsd: quote.costs.platformFeeUsd,
      expiresAt: quote.expiresAt,
      inputDecimals: buy ? USDC_DECIMALS : STOCK_DECIMALS,
      outputDecimals: buy ? STOCK_DECIMALS : USDC_DECIMALS,
      inputMultiplier: buy ? 1 : stockMultiplier,
      outputMultiplier: buy ? stockMultiplier : 1,
      built: false,
      builtTransactionBase64: null,
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
  async build(request: TradeBuildRequest, userId?: string): Promise<TradeBuildResponse> {
    const userPublicKey = request.userPublicKey?.trim() ?? "";
    if (userPublicKey.length < 32) {
      throw new DomainError("VALIDATION", "Falta la billetera para operar.");
    }
    const stored = liveQuotes.get(request.quoteId);
    if (!stored || Date.parse(stored.expiresAt) <= Date.now()) {
      throw new DomainError("QUOTE_EXPIRED", "La cotización venció. Pide una nueva.");
    }
    // Una cotización ajena responde NOT_FOUND: no se arma una tx con la
    // cotización de otro usuario ni se revela que existe.
    if (!quoteOwnedBy(stored, userId)) {
      throw new DomainError("NOT_FOUND", "No encontramos esa cotización.");
    }
    if (stored.userId === null && userId) stored.userId = userId;
    // Reserva antes del await: si dos builds llegan a la vez, sólo el
    // primero arma la tx. Un build fallido no se reintenta con la misma
    // cotización (el cliente pide una nueva): nunca dos txs firmables.
    if (stored.built) {
      throw new DomainError("QUOTE_EXPIRED", "Esta cotización ya se usó. Pide una nueva.");
    }
    stored.built = true;

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

    const order = body as Parameters<typeof parseJupiterOrder>[0] & {
      transaction?: string | null;
      requestId?: string;
    };
    const transaction = typeof order.transaction === "string" ? order.transaction : "";
    if (!transaction) {
      // Jupiter cotizó pero no pudo armar la tx (ver errorCode en la respuesta).
      throw new DomainError("UPSTREAM", "Jupiter no pudo armar la transacción.");
    }

    // Revalidación de montos: el build con `taker` vuelve a cotizar. El monto
    // de entrada no puede cambiar y la salida sólo dentro del slippage. La
    // orden registrará los montos efectivos que el usuario firma.
    let builtParsed;
    try {
      builtParsed = parseJupiterOrder(
        { ...order, requestId: order.requestId ?? stored.requestId },
        {
          side: stored.side,
          inputMint: stored.inputMint,
          outputMint: stored.outputMint,
          inputDecimals: stored.inputDecimals,
          outputDecimals: stored.outputDecimals,
          inputMultiplier: stored.inputMultiplier,
          outputMultiplier: stored.outputMultiplier,
          platformFeeBps: stored.feeBps,
        },
      );
    } catch (error) {
      throw new DomainError(
        "UPSTREAM",
        error instanceof Error ? error.message : "Jupiter devolvió montos inválidos al armar la transacción.",
      );
    }
    const effective = assertBuiltAmountsMatch(
      {
        inAmountUi: stored.inAmountUi,
        outAmountUi: stored.outAmountUi,
        pricePerShareUsd: stored.priceUsd,
      },
      builtParsed,
      defaultSlippageBps + 100,
    );
    stored.inAmountUi = effective.inAmountUi;
    stored.outAmountUi = effective.outAmountUi;
    stored.priceUsd = effective.pricePerShareUsd;
    stored.builtTransactionBase64 = transaction;

    // La tx armada puede traer un requestId nuevo; si no, reusamos el de la quote.
    const requestId = typeof order.requestId === "string" && order.requestId ? order.requestId : stored.requestId;
    // Guardamos la cotización bajo el requestId devuelto, para que `submit`
    // la recupere aunque Jupiter haya asignado uno distinto al armar la tx.
    // El id crudo de la cotización deja de servir como requestId.
    if (requestId !== stored.requestId) {
      liveQuotes.set(requestId, stored);
      liveQuotes.delete(request.quoteId);
    }

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
   * Idempotencia: ANTES de mandar la tx se inserta la orden en `pending` con
   * el `request_id` único. Si el mismo requestId ya existe (aunque esté
   * `pending` por un corte previo), se devuelve esa fila sin volver a
   * ejecutar. Sin reclamo en base NO se envía nada (falla cerrado).
   *
   * Errores: requestId desconocido o de otro usuario → NOT_FOUND; tx vacía →
   * VALIDATION; red/no se pudo registrar → UPSTREAM. Firma rechazada por
   * Jupiter → status `failed` (no UPSTREAM).
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
    if (!quoteOwnedBy(stored, userId)) {
      throw new DomainError("NOT_FOUND", "No encontramos esa operación.");
    }
    // Sólo se envía lo que pasó por `build`: un quoteId crudo no es un
    // requestId válido para submit.
    if (!stored.built) {
      throw new DomainError("NOT_FOUND", "No encontramos esa operación.");
    }
    if (Date.parse(stored.expiresAt) <= Date.now()) {
      throw new DomainError("QUOTE_EXPIRED", "La cotización venció. Pide una nueva.");
    }
    if (stored.userId === null) stored.userId = userId;
    if (!stored.builtTransactionBase64) {
      // El build no guardó la transacción: no hay forma de probar que la
      // firmada corresponde. Falla cerrado.
      throw new DomainError("NOT_FOUND", "No encontramos esa operación.");
    }
    // Integridad de la cotización efectiva y de la transacción firmada: el
    // mensaje debe ser exactamente el que armó el servidor.
    assertQuoteIntegrity({
      inAmountUi: stored.inAmountUi,
      outAmountUi: stored.outAmountUi,
      pricePerShareUsd: stored.priceUsd,
      expiresAt: stored.expiresAt,
      platformFeeUsd: stored.feeUsd,
    });
    await assertSignedTransactionMatchesBuilt(
      stored.builtTransactionBase64,
      signedTransactionBase64,
    );

    // Reclamo previo: fila `pending` con request_id único. Dos submits
    // simultáneos no pueden ejecutar dos veces la misma operación.
    let claim: Awaited<ReturnType<typeof claimOrderExecution>>;
    try {
      claim = await claimOrderExecution({
        userId,
        requestId: request.requestId,
        side: stored.side,
        symbol: stored.symbol,
        mint: stored.mint,
        inAmountUi: stored.inAmountUi,
        outAmountUi: stored.outAmountUi,
        priceUsd: stored.priceUsd,
        feeBps: stored.feeBps,
        feeUsd: stored.feeUsd,
        notionalUsd: computeNotionalUsd({
          side: stored.side,
          inAmountUi: stored.inAmountUi,
          outAmountUi: stored.outAmountUi,
          pricePerShareUsd: stored.priceUsd,
        }),
        quoteExpiresAt: stored.expiresAt,
      });
    } catch {
      claim = null;
    }
    if (!claim) {
      throw new DomainError(
        "UPSTREAM",
        "No pudimos registrar la operación. No se envió nada.",
      );
    }
    if (!claim.claimed) {
      // Ya existía (submitted/confirmed/failed/pending): nunca re-ejecutar.
      return { orderId: claim.id, signature: claim.signature, status: claim.status };
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
      // La tx pudo o no haber llegado: el reclamo `pending` impide un
      // segundo envío y la conciliación lo cierra por vencimiento. No se
      // inventa un estado final ni se libera el requestId.
      throw new DomainError(
        "UPSTREAM",
        error instanceof Error ? error.message : "No pudimos enviar la operación.",
      );
    }

    const orderStatus: Order["status"] = result.status === "submitted" ? "submitted" : "failed";
    try {
      const finalized = await finalizeOrderExecution(claim.id, {
        status: result.status,
        signature: result.signature,
        error: result.error ?? null,
      });
      if (!finalized) {
        // La tx ya salió. La fila queda `pending` (la conciliación la cierra);
        // se registra el id para poder rastrearla, nunca la tx firmada.
        console.warn(`[trade] orden ${claim.id} ejecutada sin cierre en base`);
      }
    } catch {
      console.warn(`[trade] orden ${claim.id} ejecutada sin cierre en base`);
    }
    return { orderId: claim.id, signature: result.signature, status: orderStatus };
  },

  /**
   * Estado de una orden real. Lee la fila de `orders` en Supabase y, si sigue
   * abierta, confirma en cadena con `getSignatureStatuses`. No pisa un
   * `confirmed` con un fallo transitorio del RPC (devuelve el guardado).
   *
   * Errores: id ajeno o inexistente → NOT_FOUND (la lectura por userId no
   * distingue ambos casos). RPC caído al confirmar → devuelve la orden
   * guardada tal cual (no UPSTREAM: el cliente sigue pollenado y la
   * confirmación llega en el siguiente tick).
   */
  async status(id: string, userId?: string): Promise<Order> {
    // Con sesión, la consulta exige `user_id`: un id ajeno nunca se lee ni
    // se actualiza. Sin sesión (mock/dev) se mantiene la lectura directa.
    const data = userId ? await getOrderByIdForUser(id, userId) : await getOrderById(id);
    if (!data) {
      throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
    }

    let status = data.status;
    // Si sigue abierta y tenemos firma, confirmamos contra la cadena.
    if ((status === "submitted" || status === "pending") && data.signature) {
      const rpcUrl = serverEnv.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      try {
        const { value } = await connection.getSignatureStatuses([data.signature], {
          // Sin historial, una firma fuera de la ventana reciente vuelve
          // como null y la orden quedaría `submitted` para siempre.
          searchTransactionHistory: true,
        });
        const onchain = value[0];
        if (onchain) {
          const confirmed = onchain.confirmationStatus === "finalized" || onchain.confirmationStatus === "confirmed";
          const failed = Boolean(onchain.err);
          const next: Order["status"] = failed ? "failed" : confirmed ? "confirmed" : status;
          if (next !== status) {
            const translated = failed ? translateSolanaError(onchain.err) : null;
            await updateOrderStatus(id, next as "confirmed" | "failed", {
              error: translated ? translated.userMessage : null,
              errorCode: translated ? translated.code : null,
              confirmedAt: next === "confirmed" ? new Date().toISOString() : null,
              txSignature: data.signature,
            });
            status = next;
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
