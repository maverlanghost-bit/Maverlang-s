import "server-only";

import { DomainError } from "@/lib/api/result";

/**
 * Integridad del trading real (auditoría 2026-11).
 *
 * La cotización, la transacción armada y la transacción firmada son tres
 * artefactos distintos. Este módulo valida que:
 *
 * - la cotización tenga montos/precio finitos, positivos y un vencimiento;
 * - el build de Jupiter no cambie el monto de entrada y no se despegue del
 *   monto de salida más allá del slippage permitido;
 * - la transacción que firma el cliente corresponda EXACTAMENTE al mensaje
 *   que armó el servidor (mismo mensaje, firma distinta). Sin esto, el
 *   cliente podría firmar otra transacción con el mismo requestId;
 * - una fila de `orders` no se concilie sobre montos corruptos.
 *
 * Las funciones son puras salvo `assertSignedTransactionMatchesBuilt`, que
 * carga `@solana/web3.js` de forma diferida para no meterlo en el arranque de
 * la conciliación.
 */

export type QuoteIntegrityInput = {
  inAmountUi: number;
  outAmountUi: number;
  pricePerShareUsd: number;
  expiresAt: string;
  platformFeeUsd?: number;
};

export type AmountsInput = {
  inAmountUi: number;
  outAmountUi: number;
  pricePerShareUsd: number;
};

/** Tolerancia del monto de entrada entre quote y build (0,1 %). */
export const INPUT_DEVIATION_MAX_BPS = 10;
/** Tolerancia por defecto del monto de salida entre quote y build (3 %). */
export const BUILT_OUTPUT_DEVIATION_MAX_BPS = 300;
/** Diferencia máxima tolerada entre la reserva y el notional de la orden. */
export const RESERVATION_MISMATCH_TOLERANCE_RATIO = 0.05;
export const RESERVATION_MISMATCH_TOLERANCE_USD = 1;

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Desviación relativa en bps. `Infinity` si la referencia no es válida. */
export function deviationBps(expected: number, actual: number): number {
  if (!finitePositive(expected) || !Number.isFinite(actual)) return Number.POSITIVE_INFINITY;
  return (Math.abs(actual - expected) / expected) * 10_000;
}

/** Notional en dólares: compra = USDC que entra; venta = USDC que sale. */
export function computeNotionalUsd(input: {
  side: string;
  inAmountUi: number;
  outAmountUi: number;
  pricePerShareUsd?: number | null;
}): number {
  const side = input.side === "sell" ? "sell" : "buy";
  const inUi = Number(input.inAmountUi ?? 0);
  const outUi = Number(input.outAmountUi ?? 0);
  if (side === "buy") return finitePositive(inUi) ? inUi : 0;
  if (finitePositive(outUi)) return outUi;
  const price = Number(input.pricePerShareUsd ?? 0);
  return finitePositive(inUi) && finitePositive(price) ? inUi * price : 0;
}

/**
 * Valida una cotización antes de guardarla o reservar cupo. Falla cerrado:
 * montos inventados/cero, precio no positivo o cotización ya vencida no
 * llegan a `liveQuotes`.
 */
export function assertQuoteIntegrity(quote: QuoteIntegrityInput, now: Date = new Date()): void {
  if (!finitePositive(quote.inAmountUi) || !finitePositive(quote.outAmountUi)) {
    throw new DomainError("UPSTREAM", "La cotización no trae montos válidos. Intenta de nuevo.");
  }
  if (!finitePositive(quote.pricePerShareUsd)) {
    throw new DomainError("UPSTREAM", "La cotización no trae un precio válido. Intenta de nuevo.");
  }
  if (quote.platformFeeUsd !== undefined && !finiteNonNegative(quote.platformFeeUsd)) {
    throw new DomainError("UPSTREAM", "La cotización no trae una comisión válida. Intenta de nuevo.");
  }
  const expiresMs = Date.parse(quote.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
    throw new DomainError("QUOTE_EXPIRED", "La cotización venció. Pide una nueva.");
  }
}

/**
 * Compara la cotización original con la que devuelve Jupiter al armar la
 * transacción (con `taker`). El monto de entrada no puede cambiar; el de
 * salida sólo dentro del slippage. Devuelve los montos efectivos del build
 * para que la orden registre lo que el usuario realmente firmó.
 */
export function assertBuiltAmountsMatch(
  quoted: AmountsInput,
  built: AmountsInput,
  toleranceBps: number = BUILT_OUTPUT_DEVIATION_MAX_BPS,
): AmountsInput {
  if (!finitePositive(built.inAmountUi) || !finitePositive(built.outAmountUi)) {
    throw new DomainError("UPSTREAM", "Jupiter devolvió montos inválidos al armar la operación.");
  }
  if (!finitePositive(built.pricePerShareUsd)) {
    throw new DomainError("UPSTREAM", "Jupiter devolvió un precio inválido al armar la operación.");
  }
  if (deviationBps(quoted.inAmountUi, built.inAmountUi) > INPUT_DEVIATION_MAX_BPS) {
    throw new DomainError(
      "VALIDATION",
      "El monto de entrada cambió al armar la operación. Pide una nueva cotización.",
    );
  }
  const allowed = Number.isFinite(toleranceBps) && toleranceBps > 0
    ? toleranceBps
    : BUILT_OUTPUT_DEVIATION_MAX_BPS;
  if (deviationBps(quoted.outAmountUi, built.outAmountUi) > allowed) {
    throw new DomainError("PRICE_DEVIATION");
  }
  // El precio también se despega; el monto de salida ya lo acota, pero un
  // precio corrupto no debe guardarse en la orden.
  if (deviationBps(quoted.pricePerShareUsd, built.pricePerShareUsd) > allowed) {
    throw new DomainError("PRICE_DEVIATION");
  }
  return {
    inAmountUi: built.inAmountUi,
    outAmountUi: built.outAmountUi,
    pricePerShareUsd: built.pricePerShareUsd,
  };
}

function decodeBase64(value: string): Uint8Array {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new DomainError("VALIDATION", "Falta la transacción.");
  const bytes = Buffer.from(text, "base64");
  if (bytes.length === 0) throw new DomainError("VALIDATION", "La transacción no se pudo leer.");
  return new Uint8Array(bytes);
}

/**
 * Extrae los bytes del mensaje (sin firmas) de una transacción firmada o sin
 * firmar. Soporta transacciones versionadas (Jupiter) y legacy.
 */
async function transactionMessageBytes(value: string): Promise<Uint8Array> {
  const bytes = decodeBase64(value);
  const { Transaction, VersionedTransaction } = await import("@solana/web3.js");
  try {
    const versioned = VersionedTransaction.deserialize(bytes);
    return versioned.message.serialize();
  } catch {
    // No era versionada; se intenta legacy abajo.
  }
  try {
    const legacy = Transaction.from(bytes);
    return new Uint8Array(legacy.serializeMessage());
  } catch {
    throw new DomainError("VALIDATION", "La transacción no se pudo leer.");
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * La transacción firmada por el cliente debe ser el MISMO mensaje que el
 * servidor armó en `build`. Un requestId válido con otra transacción se
 * rechaza antes de ejecutar.
 */
export async function assertSignedTransactionMatchesBuilt(
  builtTransactionBase64: string,
  signedTransactionBase64: string,
): Promise<void> {
  const built = await transactionMessageBytes(builtTransactionBase64);
  const signed = await transactionMessageBytes(signedTransactionBase64);
  if (!sameBytes(built, signed)) {
    throw new DomainError(
      "VALIDATION",
      "La transacción firmada no corresponde a la operación armada. Pide una nueva cotización.",
    );
  }
}

/** Fila mínima de `orders` para revisar integridad antes de conciliar. */
export type OrderIntegrityRow = {
  side?: string | null;
  in_amount_ui?: number | null;
  out_amount_ui?: number | null;
  price_per_share_usd?: number | null;
};

/**
 * Código de integridad de una orden (`null` = sana). Se usa en la
 * conciliación: una fila corrupta no se confirma ni se deja abierta para
 * siempre; se cierra como `failed` y se libera su reserva.
 */
export function orderIntegrityIssue(row: OrderIntegrityRow): string | null {
  const side = row.side === "sell" ? "sell" : "buy";
  const inUi = Number(row.in_amount_ui ?? 0);
  const outUi = Number(row.out_amount_ui ?? 0);
  const price = Number(row.price_per_share_usd ?? 0);
  if (!Number.isFinite(inUi) || inUi < 0) return "INVALID_AMOUNT";
  if (!Number.isFinite(outUi) || outUi < 0) return "INVALID_AMOUNT";
  if (row.price_per_share_usd !== undefined && row.price_per_share_usd !== null) {
    if (!Number.isFinite(price) || price < 0) return "INVALID_PRICE";
  }
  const notional = side === "buy"
    ? inUi
    : outUi > 0
      ? outUi
      : inUi * (Number.isFinite(price) ? price : 0);
  if (!Number.isFinite(notional) || notional <= 0) return "INVALID_AMOUNT";
  return null;
}

/** Notional de una fila de `orders`, o `null` si no se puede determinar. */
export function orderNotionalFromRow(row: OrderIntegrityRow): number | null {
  if (orderIntegrityIssue(row)) return null;
  const side = row.side === "sell" ? "sell" : "buy";
  const inUi = Number(row.in_amount_ui ?? 0);
  const outUi = Number(row.out_amount_ui ?? 0);
  const price = Number(row.price_per_share_usd ?? 0);
  if (side === "buy") return inUi;
  if (outUi > 0) return outUi;
  return inUi > 0 && price > 0 ? inUi * price : null;
}

/** ¿La diferencia entre reserva y orden merece una alerta de conciliación? */
export function reservationExceedsTolerance(reservedUsd: number, orderUsd: number): boolean {
  if (!finitePositive(reservedUsd) || !finitePositive(orderUsd)) return true;
  const tolerance = Math.max(
    RESERVATION_MISMATCH_TOLERANCE_USD,
    reservedUsd * RESERVATION_MISMATCH_TOLERANCE_RATIO,
  );
  return Math.abs(reservedUsd - orderUsd) > tolerance;
}
