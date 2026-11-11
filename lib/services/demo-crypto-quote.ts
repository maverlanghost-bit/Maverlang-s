import "server-only";

import { Connection } from "@solana/web3.js";

import { defaultSlippageBps } from "@/config/fees";
import { MAX_ORDER_USD, MIN_TRADE_USD } from "@/config/trade";
import { USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { findCryptoBySymbol } from "@/lib/catalog/crypto";
import { findEarnBySymbol } from "@/lib/catalog/lst";
import { serverEnv } from "@/lib/env";
import { fetchJupiterOrder } from "@/lib/market/jupiter-client";
import {
  jupiterOrderParams,
  jupiterSwapUrl,
  parseJupiterOrder,
  uiAmountToRaw,
  type JupiterOrderLike,
  type ParsedOrder,
} from "@/lib/market/jupiter-order";
import { fetchMintMultiplier } from "@/lib/solana/scaled-ui";
import type { Side } from "@/lib/types";

/**
 * Cotización REAL de una cripto o un LST para la cuenta DEMO (CRIPTO_F1, G3).
 *
 * - Pide `GET /swap/v2/order` de Jupiter SIN `taker`: es una cotización pura,
 *   sin transacción que firmar. La orden se paga y se asienta con `demo_trade`
 *   (plata ficticia); acá sólo se calcula el cruce real.
 * - Compra: USDC → mint del catálogo. Venta: mint → USDC. Los decimales salen
 *   del catálogo (`lib/catalog/crypto.ts`, `lib/catalog/lst.ts`), nunca de 8
 *   fijos como en las acciones.
 * - Multiplicador Token-2022 por la ruta existente (`fetchMintMultiplier`):
 *   devuelve 1 cuando el mint no tiene ScaledUiAmount, que es el caso de estas
 *   criptos y LST. Si el RPC no responde se usa 1 (el propio helper documenta
 *   ese fallback para cuentas sin extensión); el precio NUNCA se inventa.
 * - Mínimo `MIN_TRADE_USD` y tope por sello: AMARILLO = `maxOrderUsd` del
 *   token, VERDE (y LST) = `MAX_ORDER_USD`. SIN precio, monto 0 u orden
 *   inválida → `DomainError("UPSTREAM")` con el mismo mensaje de precio que ya
 *   usa la demo (`PRICE_MESSAGE` en `demo.supabase.ts`).
 *
 * Sólo servidor: la clave de Jupiter viaja por header, nunca en la URL.
 */

const USDC_DECIMALS = 6;

/** Mismo texto que `PRICE_MESSAGE` en `lib/services/demo.supabase.ts`. */
export const DEMO_CRYPTO_PRICE_MESSAGE = "No pudimos obtener el precio, intenta en un momento.";

const FX_CLP_MESSAGE = "Sin dólar no podemos convertir pesos a dólares. Prueba en unos minutos.";

const TOO_LOW_MESSAGE = "El monto es demasiado bajo.";

export type DemoCryptoSeal = "VERDE" | "AMARILLO";

/** Activo de cripto o de Ganar resuelto desde los catálogos curados. */
export type DemoCryptoAsset = {
  symbol: string;
  mint: string;
  /** `null` cuando el catálogo no confirmó los decimales (ese token no se cotiza). */
  decimals: number | null;
  /** Sello del catálogo de criptos; `null` para los LST. */
  seal: DemoCryptoSeal | null;
  /** true si también se ofrece en Ganar (LST o USDY). */
  isEarn: boolean;
  /** Tope por orden en USD del nocional de la compra (AMARILLO). */
  maxOrderUsd: number;
  /** Programa del token; `"spl"` no necesita leer el multiplicador. */
  tokenProgram?: "spl" | "token-2022";
};

export type DemoCryptoQuoteInput = {
  symbol: string;
  side: Side;
  amount: number;
  amountCurrency: "USDC" | "SHARES" | "CLP";
  /** Dólar observado, ya resuelto por el llamador cuando la moneda es CLP. */
  fxRate?: number | null;
  /**
   * Precio de referencia en USD por unidad del token. Sólo se usa para
   * convertir un monto pedido en unidades del token a USDC (o al revés); el
   * precio de la operación SIEMPRE sale de la orden de Jupiter.
   */
  referencePriceUsd?: number | null;
};

export type DemoCryptoQuote = {
  symbol: string;
  mint: string;
  decimals: number;
  multiplier: number;
  isEarn: boolean;
  side: Side;
  /** Unidades del token que salen (compra) o entran (venta) al swap. */
  tokenAmount: number;
  /** USDC que entran (compra) o salen (venta) del swap. */
  usdcAmount: number;
  /** Nocional en USD usado para el mínimo y el tope. */
  notionalUsd: number;
  /** Precio implícito del cruce, en USD por unidad del token. */
  priceUsd: number;
  priceImpactPct: number;
  slippageBps: number;
  /** Id de la orden de Jupiter (la demo lo usa como id de cotización firmada). */
  requestId: string;
  route: "jupiter";
  /** Router que informó Jupiter (p. ej. meta-aggregator); informativo. */
  router: string | null;
};

export type DemoCryptoQuoteDeps = {
  /** Inyectable en pruebas: devuelve el cuerpo JSON de `/swap/v2/order`. */
  fetchOrder?: (input: { url: string; apiKey?: string }) => Promise<unknown>;
  /** Inyectable en pruebas: multiplicador Token-2022 del mint (1 si no aplica). */
  multiplierOf?: (mint: string) => Promise<number>;
};

/**
 * Activo de cripto o de Ganar por símbolo (sin distinguir mayúsculas).
 * Las criptos mandan: USDY está en los dos catálogos y conserva su sello VERDE.
 */
export function demoCryptoAsset(symbol: string): DemoCryptoAsset | null {
  const wanted = typeof symbol === "string" ? symbol.trim() : "";
  if (!wanted) return null;
  const earn = findEarnBySymbol(wanted);
  const crypto = findCryptoBySymbol(wanted);
  if (crypto) {
    return {
      symbol: crypto.symbol,
      mint: crypto.mint,
      decimals: crypto.decimals,
      seal: crypto.seal,
      isEarn: earn !== null,
      maxOrderUsd: crypto.maxOrderUsd,
      tokenProgram: crypto.tokenProgram,
    };
  }
  if (earn) {
    return {
      symbol: earn.symbol,
      mint: earn.mint,
      decimals: earn.decimals,
      seal: null,
      isEarn: true,
      maxOrderUsd: MAX_ORDER_USD,
    };
  }
  return null;
}

/** Tope por orden del nocional de la compra: AMARILLO por token, VERDE 1.000. */
function maxOrderUsdOf(asset: DemoCryptoAsset): number {
  if (asset.seal !== "AMARILLO") return MAX_ORDER_USD;
  return Number.isFinite(asset.maxOrderUsd) && asset.maxOrderUsd > 0
    ? asset.maxOrderUsd
    : MAX_ORDER_USD;
}

function formatUsd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function tooSmall(): DomainError {
  return new DomainError(
    "VALIDATION",
    `El monto mínimo es US$${formatUsd(MIN_TRADE_USD)}.`,
  );
}

function tooLarge(symbol: string, capUsd: number): DomainError {
  return new DomainError(
    "VALIDATION",
    `El máximo por orden para ${symbol} es US$${formatUsd(capUsd)}.`,
  );
}

function priceUnavailable(): DomainError {
  return new DomainError("UPSTREAM", DEMO_CRYPTO_PRICE_MESSAGE);
}

/**
 * Multiplicador Token-2022 por la ruta existente. Estas criptos y LST no usan
 * ScaledUiAmount: si el RPC no responde a tiempo se usa 1, el mismo fallback
 * que ya aplica `prices.live` al leer multiplicadores (800 ms, valor 1).
 */
const MULTIPLIER_TIMEOUT_MS = 800;

async function defaultMultiplierOf(mint: string): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rpcUrl = serverEnv.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    // `.catch` para que un rechazo tardío (después del timeout) no quede suelto.
    const read = fetchMintMultiplier(connection, mint).catch(() => 1);
    return await Promise.race([
      read,
      new Promise<number>((resolve) => {
        timer = setTimeout(() => resolve(1), MULTIPLIER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return 1;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function defaultFetchOrder(input: { url: string; apiKey?: string }): Promise<unknown> {
  return fetchJupiterOrder({
    url: input.url,
    base: serverEnv.JUPITER_BASE_URL,
    apiKey: input.apiKey,
  });
}

/**
 * Cotiza la compra/venta de una cripto o un LST contra Jupiter. Devuelve los
 * montos del cruce, el precio implícito, el impacto, la ruta y el `requestId`.
 * Lanza `UPSTREAM` con el mensaje de precio de la demo si Jupiter no cotiza,
 * si el monto es cero o si la orden no es válida.
 */
export async function quoteDemoCrypto(
  input: DemoCryptoQuoteInput,
  deps: DemoCryptoQuoteDeps = {},
): Promise<DemoCryptoQuote> {
  const asset = demoCryptoAsset(input.symbol);
  if (!asset) throw new DomainError("MINT_NOT_ALLOWED");
  // Sin decimales confirmados no se arma el crudo: no se cotiza (NEAR hoy).
  if (asset.decimals === null) throw priceUnavailable();
  const decimals = asset.decimals;
  if (!(input.amount > 0) || !Number.isFinite(input.amount)) {
    throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
  }

  const buy = input.side === "buy";
  const fx = input.fxRate ?? null;
  const reference = input.referencePriceUsd ?? null;
  const capUsd = maxOrderUsdOf(asset);

  // Monto que ENTRA al swap y nocional en USD para mínimo/tope.
  let usdcIn = 0;
  let tokenIn = 0;
  let notionalUsd = 0;
  let notionalKnown = false;

  if (buy) {
    if (input.amountCurrency === "USDC") {
      usdcIn = input.amount;
    } else if (input.amountCurrency === "CLP") {
      if (fx === null || !(fx > 0) || !Number.isFinite(fx)) {
        throw new DomainError("VALIDATION", FX_CLP_MESSAGE);
      }
      usdcIn = input.amount / fx;
    } else {
      // Compra pedida en unidades del token: hace falta el precio de referencia.
      if (reference === null || !(reference > 0) || !Number.isFinite(reference)) {
        throw priceUnavailable();
      }
      usdcIn = input.amount * reference;
    }
    if (!(usdcIn > 0) || !Number.isFinite(usdcIn)) throw tooSmall();
    notionalUsd = usdcIn;
    notionalKnown = true;
  } else if (input.amountCurrency === "SHARES") {
    tokenIn = input.amount;
  } else {
    const usd =
      input.amountCurrency === "CLP"
        ? fx !== null && fx > 0
          ? input.amount / fx
          : Number.NaN
        : input.amount;
    if (!(usd > 0) || !Number.isFinite(usd)) {
      throw new DomainError("VALIDATION", FX_CLP_MESSAGE);
    }
    if (reference === null || !(reference > 0) || !Number.isFinite(reference)) {
      throw priceUnavailable();
    }
    tokenIn = usd / reference;
    notionalUsd = usd;
    notionalKnown = true;
  }

  // Mínimo y tope ANTES de gastar una llamada a Jupiter cuando ya se conoce
  // el nocional (compra por USDC/CLP/REF).
  if (notionalKnown) {
    if (notionalUsd < MIN_TRADE_USD - 1e-9) throw tooSmall();
    if (buy && notionalUsd > capUsd + 1e-9) throw tooLarge(asset.symbol, capUsd);
  }

  const multiplierOf = deps.multiplierOf ?? defaultMultiplierOf;
  // Multiplicador: 1 salvo que el catálogo marque el mint como Token-2022 (ahí
  // se usa la ruta existente de `fetchMintMultiplier`). Ninguna cripto ni LST
  // de la lista usa ScaledUiAmount hoy, así que no se toca el RPC.
  let multiplier =
    asset.tokenProgram === "token-2022" ? await multiplierOf(asset.mint) : 1;
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) multiplier = 1;

  let amountRaw: bigint;
  try {
    amountRaw = buy
      ? uiAmountToRaw(usdcIn, USDC_DECIMALS, 1)
      : uiAmountToRaw(tokenIn, decimals, multiplier);
  } catch {
    throw new DomainError("VALIDATION", TOO_LOW_MESSAGE);
  }
  if (amountRaw <= BigInt(0)) throw new DomainError("VALIDATION", TOO_LOW_MESSAGE);

  const inputMint = buy ? USDC_MINT : asset.mint;
  const outputMint = buy ? asset.mint : USDC_MINT;
  const inputDecimals = buy ? USDC_DECIMALS : decimals;
  const outputDecimals = buy ? decimals : USDC_DECIMALS;
  const inputMultiplier = buy ? 1 : multiplier;
  const outputMultiplier = buy ? multiplier : 1;

  // SIN `taker`: cotización pura, sin transacción. La key sólo va por header.
  const url = jupiterSwapUrl(serverEnv.JUPITER_BASE_URL, "/swap/v2/order");
  const query = jupiterOrderParams({
    side: input.side,
    inputMint,
    outputMint,
    amountRaw,
    slippageBps: defaultSlippageBps,
  });

  const fetchOrder = deps.fetchOrder ?? defaultFetchOrder;
  let body: unknown;
  try {
    body = await fetchOrder({
      url: `${url}?${query.toString()}`,
      apiKey: serverEnv.JUPITER_API_KEY,
    });
  } catch {
    throw priceUnavailable();
  }

  const order = body as JupiterOrderLike | null;
  if (!order || typeof order !== "object") throw priceUnavailable();
  // La orden tiene que ser del par que pedimos; si no, no sirve para cotizar.
  if (
    (typeof order.inputMint === "string" && order.inputMint !== inputMint) ||
    (typeof order.outputMint === "string" && order.outputMint !== outputMint)
  ) {
    throw priceUnavailable();
  }

  let parsed: ParsedOrder | null = null;
  try {
    parsed = parseJupiterOrder(order, {
      side: input.side,
      inputMint,
      outputMint,
      inputDecimals,
      outputDecimals,
      inputMultiplier,
      outputMultiplier,
      platformFeeBps: 0,
    });
  } catch {
    throw priceUnavailable();
  }
  if (!parsed) throw priceUnavailable();

  const tokenAmount = buy ? parsed.outAmountUi : parsed.inAmountUi;
  const usdcAmount = buy ? parsed.inAmountUi : parsed.outAmountUi;
  if (!(tokenAmount > 0) || !(usdcAmount > 0)) throw priceUnavailable();

  // En venta el nocional se conoce recién con la orden (USDC que salen).
  if (!notionalKnown) notionalUsd = usdcAmount;
  if (notionalUsd < MIN_TRADE_USD - 1e-9) throw tooSmall();
  if (buy && notionalUsd > capUsd + 1e-9) throw tooLarge(asset.symbol, capUsd);

  const router = typeof order.router === "string" && order.router.trim() !== ""
    ? order.router.trim()
    : null;

  return {
    symbol: asset.symbol,
    mint: asset.mint,
    decimals,
    multiplier,
    isEarn: asset.isEarn,
    side: input.side,
    tokenAmount,
    usdcAmount,
    notionalUsd,
    priceUsd: parsed.pricePerShareUsd,
    priceImpactPct: parsed.priceImpactPct,
    slippageBps: parsed.slippageBps,
    requestId: parsed.requestId,
    route: "jupiter",
    router,
  };
}
