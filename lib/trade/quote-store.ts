import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  releaseQuietly,
  reserveOrThrow,
  type ReservationStore,
} from "@/lib/trade/reservations";

/**
 * Cotización viva del comercio real (ola 6 / T38; hallazgo M-05 de la auditoría
 * 2026-11).
 *
 * Antes vivía en un `Map` del proceso (`lib/services/trade.live.ts`): en Vercel
 * cada instancia tiene el suyo, así que la cotización que se reservaba en una
 * lambda no era la que se ejecutaba desde otra y `build`/`submit` respondían
 * QUOTE_EXPIRED al azar.
 *
 * Ahora la cotización se guarda EN la reserva de cupo (0042/0047 + 0049): la
 * fila de `trade_reservations` es la dueña del dueño, del estado y del
 * vencimiento, y lleva el payload de la cotización en `quote_payload`. Con eso:
 *
 * - es compartida: `build`/`submit` leen la misma fila desde cualquier instancia;
 * - el TTL es el de la cotización (`expiresAt`), no el del proceso;
 * - una cotización nueva del mismo usuario reemplaza a la anterior (D-06): no se
 *   acumulan topes;
 * - si la tabla/RPC no responde, cotizar, armar y enviar fallan cerrado.
 *
 * La demo NO pasa por acá: `lib/mocks/demo-state.ts` conserva su `Map` porque
 * vive entera dentro de un proceso de demostración.
 *
 * Este módulo no habla con la red ni con la base: el `LiveQuoteStore` (payload)
 * y el `ReservationStore` (cupo) se inyectan. Producción:
 * `lib/services/trade-quotes.supabase.ts` + `lib/services/trade-reservations.supabase.ts`.
 */

/** Versión del payload guardado en `quote_payload`. Cambiarla invalida lo viejo. */
export const LIVE_QUOTE_VERSION = 1;

/** Tope del payload serializado: una tx de Jupiter entra de sobra. */
export const LIVE_QUOTE_MAX_BYTES = 65_536;

export type LiveQuoteStatus = "reserved" | "consumed" | "released";

/**
 * Payload JSON de la cotización. Todo lo que `build` necesita para volver a
 * pedirle la transacción a Jupiter y lo que `submit` necesita para comparar la
 * tx firmada. `amountRaw` viaja como texto: un bigint no sobrevive a JSON.
 */
export type LiveQuotePayload = {
  version: typeof LIVE_QUOTE_VERSION;
  requestId: string;
  side: "buy" | "sell";
  symbol: string;
  mint: string;
  inputMint: string;
  outputMint: string;
  amountRaw: string;
  priceUsd: number;
  inAmountUi: number;
  outAmountUi: number;
  feeBps: number;
  feeUsd: number;
  /** Vencimiento de la cotización (ISO). Es el TTL que manda. */
  expiresAt: string;
  inputDecimals: number;
  outputDecimals: number;
  inputMultiplier: number;
  outputMultiplier: number;
  /** Una cotización se arma UNA sola vez (claim atómico en la base). */
  built: boolean;
  /** Tx sin firmar que devolvió Jupiter; `submit` la compara con la firmada. */
  builtTransactionBase64: string | null;
};

/** Cambios que `build` persiste después de que Jupiter arma la transacción. */
export type BuiltQuotePatch = {
  inAmountUi: number;
  outAmountUi: number;
  priceUsd: number;
  builtTransactionBase64: string;
};

/** Cotización leída del almacén, con el estado de su reserva. */
export type StoredLiveQuote = {
  payload: LiveQuotePayload;
  status: LiveQuoteStatus;
  /** Vencimiento de la fila de reserva (ISO). Informativo: el TTL es el del payload. */
  reservationExpiresAt: string;
};

export type SaveQuotePayloadInput = {
  userId: string;
  requestId: string;
  symbol: string;
  payload: LiveQuotePayload;
};

/**
 * Almacén del payload de la cotización, siempre dentro de una reserva activa.
 *
 * - `saveQuote` sólo escribe si la reserva de ese `(usuario, requestId)` está
 *   `reserved` y vigente, y sólo la primera vez (no se reescribe una cotización
 *   ya guardada).
 * - `claimBuild` es un compare-and-set: pasa `built` de `false` a `true` y
 *   devuelve `false` si otro proceso ya lo hizo. Sin esto, dos builds
 *   simultáneos en dos instancias armarían dos transacciones firmables.
 * - `recordBuilt` persiste montos efectivos y la tx armada sólo si el claim ya
 *   ocurrió.
 */
export type LiveQuoteStore = {
  saveQuote(input: SaveQuotePayloadInput): Promise<void>;
  readQuote(userId: string, requestId: string): Promise<StoredLiveQuote | null>;
  claimBuild(userId: string, requestId: string): Promise<boolean>;
  recordBuilt(
    userId: string,
    requestId: string,
    patch: BuiltQuotePatch,
  ): Promise<void>;
};

/** Las dos piezas que usa el motor real: cupo y cotización. */
export type LiveQuoteStores = {
  reservations: ReservationStore;
  quotes: LiveQuoteStore;
};

const MAX_ID_LENGTH = 256;
const MAX_MINT_LENGTH = 64;
const MAX_SYMBOL_LENGTH = 32;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function positive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegative(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function decimals(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= 18 ? n : null;
}

function isoInstant(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Valida un payload leído del almacén. Devuelve `null` si no es utilizable: un
 * payload corrupto no arma ninguna transacción (fallar cerrado, sin inventar
 * montos).
 */
export function parseLiveQuotePayload(value: unknown): LiveQuotePayload | null {
  const row = asRecord(value);
  if (!row) return null;
  if (row.version !== LIVE_QUOTE_VERSION) return null;

  const requestId = text(row.requestId, MAX_ID_LENGTH);
  const side = row.side === "buy" || row.side === "sell" ? row.side : null;
  const symbol = text(row.symbol, MAX_SYMBOL_LENGTH);
  const mint = text(row.mint, MAX_MINT_LENGTH);
  const inputMint = text(row.inputMint, MAX_MINT_LENGTH);
  const outputMint = text(row.outputMint, MAX_MINT_LENGTH);
  const amountRaw = typeof row.amountRaw === "string" ? row.amountRaw.trim() : "";
  const priceUsd = positive(row.priceUsd);
  const inAmountUi = positive(row.inAmountUi);
  const outAmountUi = positive(row.outAmountUi);
  const feeBps = nonNegative(row.feeBps);
  const feeUsd = nonNegative(row.feeUsd);
  const expiresAt = isoInstant(row.expiresAt);
  const inputDecimals = decimals(row.inputDecimals);
  const outputDecimals = decimals(row.outputDecimals);
  const inputMultiplier = positive(row.inputMultiplier);
  const outputMultiplier = positive(row.outputMultiplier);
  const built = row.built === true;
  const builtTransactionBase64 =
    row.builtTransactionBase64 === null || row.builtTransactionBase64 === undefined
      ? null
      : text(row.builtTransactionBase64, LIVE_QUOTE_MAX_BYTES);

  if (
    !requestId ||
    !side ||
    !symbol ||
    !mint ||
    !inputMint ||
    !outputMint ||
    !amountRaw ||
    !/^\d+$/.test(amountRaw) ||
    amountRaw === "0" ||
    priceUsd === null ||
    inAmountUi === null ||
    outAmountUi === null ||
    feeBps === null ||
    feeBps > 10_000 ||
    feeUsd === null ||
    !expiresAt ||
    inputDecimals === null ||
    outputDecimals === null ||
    inputMultiplier === null ||
    outputMultiplier === null
  ) {
    return null;
  }
  // Una cotización marcada como armada sin la tx es inservible: no se acepta.
  if (built && !builtTransactionBase64) return null;

  return {
    version: LIVE_QUOTE_VERSION,
    requestId,
    side,
    symbol,
    mint,
    inputMint,
    outputMint,
    amountRaw,
    priceUsd,
    inAmountUi,
    outAmountUi,
    feeBps,
    feeUsd,
    expiresAt,
    inputDecimals,
    outputDecimals,
    inputMultiplier,
    outputMultiplier,
    built,
    builtTransactionBase64: builtTransactionBase64 ?? null,
  };
}

/** Igual que `parseLiveQuotePayload`, pero para un payload propio: lanza. */
export function assertLiveQuotePayload(
  value: unknown,
  expectedRequestId?: string,
): LiveQuotePayload {
  const payload = parseLiveQuotePayload(value);
  if (!payload) {
    throw new DomainError("UPSTREAM", "La cotización no quedó bien formada. Pide una nueva.");
  }
  if (expectedRequestId && payload.requestId !== expectedRequestId) {
    throw new DomainError("UPSTREAM", "La cotización no corresponde a la operación.");
  }
  if (JSON.stringify(payload).length > LIVE_QUOTE_MAX_BYTES) {
    throw new DomainError("UPSTREAM", "La cotización es demasiado grande para guardarla.");
  }
  return payload;
}

function requireOwner(userId: string | null | undefined): string {
  const owner = typeof userId === "string" ? userId.trim() : "";
  if (!owner) throw new DomainError("UNAUTHORIZED");
  return owner;
}

/** La cotización venció cuando su `expiresAt` ya pasó. */
export function liveQuoteExpired(
  quote: { expiresAt: string },
  now: Date = new Date(),
): boolean {
  const ms = Date.parse(quote.expiresAt);
  return !Number.isFinite(ms) || ms <= now.getTime();
}

/**
 * Guarda la cotización creando su reserva de cupo (D-06: reemplaza la anterior
 * del mismo usuario) y escribiendo el payload en esa misma fila.
 *
 * Si la reserva no se puede tomar, lanza el `DomainError` de siempre
 * (LIMIT_*, QUOTE_EXPIRED, UPSTREAM). Si la reserva se tomó pero el payload no
 * se pudo guardar, se libera el cupo y se falla cerrado: sin cotización
 * guardada no hay nada que ejecutar después.
 */
export async function saveQuotedTrade(
  stores: LiveQuoteStores,
  input: {
    userId: string;
    payload: LiveQuotePayload;
    amountUsd: number;
    reservationExpiresAt: string;
  },
  now: Date = new Date(),
): Promise<LiveQuotePayload> {
  const userId = requireOwner(input.userId);
  const payload = assertLiveQuotePayload(input.payload);
  if (payload.built) {
    throw new DomainError("UPSTREAM", "La cotización nueva no puede venir ya armada.");
  }

  await reserveOrThrow(
    stores.reservations,
    {
      userId,
      requestId: payload.requestId,
      amountUsd: input.amountUsd,
      expiresAt: input.reservationExpiresAt,
    },
    now,
  );

  try {
    await stores.quotes.saveQuote({
      userId,
      requestId: payload.requestId,
      symbol: payload.symbol,
      payload,
    });
  } catch {
    // Sin fila en el almacén la cotización no existe fuera de este proceso:
    // se devuelve el cupo y se falla cerrado (nunca se ejecuta a ciegas).
    await releaseQuietly(stores.reservations, userId, payload.requestId);
    throw new DomainError(
      "UPSTREAM",
      "No pudimos guardar la cotización. No se reservó nada.",
    );
  }

  return payload;
}

/**
 * Lee la cotización del almacén compartido. Lanza UPSTREAM si el almacén no
 * responde (fallar cerrado) y devuelve `null` si no existe o está corrupta.
 */
export async function loadQuotedTrade(
  stores: LiveQuoteStores,
  userId: string,
  requestId: string,
): Promise<StoredLiveQuote | null> {
  const owner = requireOwner(userId);
  const id = typeof requestId === "string" ? requestId.trim() : "";
  if (!id || id.length > MAX_ID_LENGTH) return null;

  let stored: StoredLiveQuote | null;
  try {
    stored = await stores.quotes.readQuote(owner, id);
  } catch {
    throw new DomainError(
      "UPSTREAM",
      "No pudimos leer la cotización. No se envió nada.",
    );
  }
  if (!stored) return null;

  const payload = parseLiveQuotePayload(stored.payload);
  if (!payload || payload.requestId !== id) return null;
  const status: LiveQuoteStatus =
    stored.status === "consumed" || stored.status === "released"
      ? stored.status
      : "reserved";
  const reservationExpiresAt = isoInstant(stored.reservationExpiresAt) ?? payload.expiresAt;
  return { payload, status, reservationExpiresAt };
}

/**
 * Reclama el armado de la cotización. `false` = otro proceso ya la armó (o la
 * reserva dejó de estar activa): nunca se arman dos transacciones firmables de
 * la misma operación.
 */
export async function claimQuotedTradeBuild(
  stores: LiveQuoteStores,
  userId: string,
  requestId: string,
): Promise<boolean> {
  const owner = requireOwner(userId);
  try {
    return await stores.quotes.claimBuild(owner, requestId.trim());
  } catch {
    throw new DomainError(
      "UPSTREAM",
      "No pudimos reservar la cotización para armar la operación.",
    );
  }
}

/** Persiste la tx armada y los montos efectivos. Si falla, no hay nada que firmar. */
export async function recordQuotedTradeBuild(
  stores: LiveQuoteStores,
  userId: string,
  requestId: string,
  patch: BuiltQuotePatch,
): Promise<void> {
  const owner = requireOwner(userId);
  if (
    !Number.isFinite(patch.inAmountUi) ||
    patch.inAmountUi <= 0 ||
    !Number.isFinite(patch.outAmountUi) ||
    patch.outAmountUi <= 0 ||
    !Number.isFinite(patch.priceUsd) ||
    patch.priceUsd <= 0 ||
    typeof patch.builtTransactionBase64 !== "string" ||
    patch.builtTransactionBase64.trim() === ""
  ) {
    throw new DomainError("UPSTREAM", "Jupiter devolvió una operación incompleta.");
  }
  try {
    await stores.quotes.recordBuilt(owner, requestId.trim(), patch);
  } catch {
    throw new DomainError(
      "UPSTREAM",
      "No pudimos registrar la operación armada. No la firmes: pide una cotización nueva.",
    );
  }
}

/** Libera la cotización (best effort): no rompe al llamador. */
export async function releaseQuotedTrade(
  stores: LiveQuoteStores,
  userId: string,
  requestId: string,
): Promise<boolean> {
  const owner = typeof userId === "string" ? userId.trim() : "";
  if (!owner) return false;
  return releaseQuietly(stores.reservations, owner, requestId.trim());
}
