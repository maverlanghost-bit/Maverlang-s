/**
 * Parser PURO de la cotización de Jupiter Swap v2 (`GET /swap/v2/order`).
 * No toca la red: recibe el cuerpo JSON tal cual y devuelve una estructura
 * tipada lista para mapear a `TradeQuote`. Los tests fijan la forma.
 *
 * Júpiter devuelve los montos como strings en unidades CRUDAS del mint
 * (no en UI). Para pasar a "acciones" o "USDC" visibles hay que dividir por
 * 10^decimals y, en Token-2022 (xStocks/Ondo), multiplicar por el
 * multiplicador escalado del mint (`lib/solana/scaled-ui.ts`).
 */

/** Subset de la respuesta de `/swap/v2/order` que nos interesa. */
export interface JupiterOrderLike {
  requestId?: string;
  inputMint?: string;
  outputMint?: string;
  inAmount?: string | number;
  outAmount?: string | number;
  inAmountUi?: string | number;
  outAmountUi?: string | number;
  priceImpactPct?: string | number;
  slippageBps?: string | number;
  routePlan?: unknown;
  router?: string;
  mode?: string;
  /** Transacción armada en base64 (sólo cuando se pasa `taker`). */
  transaction?: string | null;
  transactionVersion?: string | number;
}

/** Subset de la respuesta de `POST /swap/v2/execute` que nos interesa. */
export interface JupiterExecuteLike {
  status?: string;
  signature?: string;
  code?: number;
  error?: string;
  inputAmountResult?: string | number;
  outputAmountResult?: string | number;
}

export interface OrderParseOptions {
  side: "buy" | "sell";
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  /** Multiplicador Token-2022 del mint de entrada (1 para USDC). */
  inputMultiplier: number;
  /** Multiplicador Token-2022 del mint de salida (xStocks/Ondo). */
  outputMultiplier: number;
  /** Comisión propia en bps (0 al lanzamiento). */
  platformFeeBps: number;
}

export interface ParsedOrder {
  requestId: string;
  /** Monto de entrada en unidades UI (USDC en compra, acciones en venta). */
  inAmountUi: number;
  /** Monto de salida en unidades UI (acciones en compra, USDC en venta). */
  outAmountUi: number;
  /** Precio por acción en USD del cruce (salida→precio). */
  pricePerShareUsd: number;
  priceImpactPct: number;
  slippageBps: number;
  platformFeeBps: number;
  /** true si la orden vino por RFQ (JupiterZ/DFlow) sin routePlan AMM. */
  isRfq: boolean;
}

/** crudo → UI: divide por 10^decimals y aplica el multiplicador escalado. */
export function rawAmountToUi(raw: bigint, decimals: number, multiplier = 1): number {
  return (Number(raw) / 10 ** decimals) * multiplier;
}

/** UI → crudo: inversa de `rawAmountToUi`. Redondea al entero. */
export function uiAmountToRaw(ui: number, decimals: number, multiplier = 1): bigint {
  if (multiplier <= 0) throw new Error("multiplicador inválido");
  const raw = (ui / multiplier) * 10 ** decimals;
  if (!Number.isFinite(raw) || raw < 0) throw new Error("monto fuera de rango");
  return BigInt(Math.round(raw));
}

function asBigInt(value: string | number | undefined, field: string): bigint {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return BigInt(value);
  throw new Error(`Jupiter ${field} no es un entero crudo válido`);
}

function asNumber(value: string | number | undefined, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Arma la URL de un endpoint del swap sobre el base (sin barra final duplicada). */
export function jupiterSwapUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface OrderParamsInput {
  side: "buy" | "sell";
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps: number;
  taker?: string;
}

/**
 * Query para `GET /swap/v2/order`. El servicio pasa los mints ya en el
 * orden correcto según el lado (compra: USDC→acción; venta: acción→USDC).
 * `taker` sólo cuando se arma la transacción; en una cotización pura se omite.
 */
export function jupiterOrderParams(input: OrderParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set("inputMint", input.inputMint);
  params.set("outputMint", input.outputMint);
  params.set("amount", input.amountRaw.toString());
  params.set("slippageBps", String(input.slippageBps));
  if (input.taker && input.taker.trim().length >= 32) params.set("taker", input.taker.trim());
  return params;
}

/**
 * Convierte el cuerpo de `/swap/v2/order` en nuestra cotización.
 * Valida: requestId presente, montos crudos enteros. Distingue RFQ (sin
 * `routePlan`, con `router` o montos válidos) de ruta AMM.
 */
export function parseJupiterOrder(body: JupiterOrderLike, options: OrderParseOptions): ParsedOrder {
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) throw new Error("Jupiter sin requestId");

  const inRaw = asBigInt(body.inAmount, "inAmount");
  const outRaw = asBigInt(body.outAmount, "outAmount");
  if (inRaw <= BigInt(0) || outRaw <= BigInt(0)) {
    throw new Error("Jupiter devolvió un monto cero");
  }

  const inAmountUi = rawAmountToUi(inRaw, options.inputDecimals, options.inputMultiplier);
  const outAmountUi = rawAmountToUi(outRaw, options.outputDecimals, options.outputMultiplier);
  if (!(inAmountUi > 0) || !(outAmountUi > 0)) {
    throw new Error("Jupiter: montos UI no positivos");
  }

  // Precio por acción del cruce. Compra: USDC entrado / acciones recibidas.
  // Venta: USDC recibido / acciones enviadas. En ambos, precio = USDC / acciones.
  const isBuy = options.side === "buy";
  const usdcUi = isBuy ? inAmountUi : outAmountUi;
  const sharesUi = isBuy ? outAmountUi : inAmountUi;
  const pricePerShareUsd = usdcUi / sharesUi;
  if (!Number.isFinite(pricePerShareUsd) || pricePerShareUsd <= 0) {
    throw new Error("Jupiter: precio por acción inválido");
  }

  const isRfq = body.routePlan === undefined || body.routePlan === null;
  const slippageBps = Math.round(asNumber(body.slippageBps, 50));

  return {
    requestId,
    inAmountUi,
    outAmountUi,
    pricePerShareUsd,
    priceImpactPct: asNumber(body.priceImpactPct, 0),
    slippageBps,
    platformFeeBps: options.platformFeeBps,
    isRfq,
  };
}

/**
 * Parser PURO de la respuesta de EJECUCIÓN (`POST /swap/v2/execute`).
 * `status` "Success" → "submitted", "Failed" → "failed".
 * Si es submitted exige signature no vacía; si no, lanza.
 */
export function parseJupiterExecute(body: JupiterExecuteLike): {
  status: "submitted" | "failed";
  signature: string | null;
  error?: string;
} {
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (status === "Success") {
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!signature) throw new Error("Jupiter execute sin signature");
    return { status: "submitted", signature };
  }
  if (status === "Failed") {
    const rawError = typeof body.error === "string" ? body.error.trim() : "";
    return {
      status: "failed",
      signature: null,
      ...(rawError ? { error: rawError } : {}),
    };
  }
  throw new Error("Jupiter execute con status desconocido");
}

/** true si la orden trae transacción base64 no vacía (con `taker`). */
export function orderHasTransaction(order: JupiterOrderLike): boolean {
  return typeof order.transaction === "string" && order.transaction.trim() !== "";
}
