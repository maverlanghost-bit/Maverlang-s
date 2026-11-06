import "server-only";

import { USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { createSupabaseWithdrawalStore } from "@/lib/services/withdrawals.supabase";
import {
  updateWalletMovementStatus,
  upsertWalletMovement,
} from "@/lib/services/wallet-movements.supabase";
import { tickerByMint } from "@/lib/solana/allowlist";
import { getServerConnection } from "@/lib/solana/connection";
import { signatureStatusToOrder, type SignatureStatusLike } from "@/lib/solana/signature-status";
import { translateSolanaError } from "@/lib/solana/tx-errors";
import {
  assertSignedTransactionMatchesBuilt,
  readTransactionSignature,
} from "@/lib/trade/integrity";
import type { Order, TradeSubmitResponse } from "@/lib/types";

/**
 * Libro de retiros (T42, auditoría D-02).
 *
 * El agujero que cierra: hasta acá `POST /api/wallet/send/build` armaba una
 * transferencia con sólo un tope por operación. No existía un libro que sumara
 * las salidas del día/mes, ni una forma de saber si la transacción que el
 * cliente firmó se llegó a transmitir. Sin eso, reintentar un envío podía
 * duplicar una salida real y no había manera de frenar a alguien que partiera
 * el monto en diez envíos.
 *
 * Este módulo es la capa de DOMINIO: decide, valida y ordena los efectos
 * (reservar cupo, reclamar el envío, transmitir, conciliar). La persistencia se
 * inyecta:
 *
 * - producción: `createSupabaseWithdrawalStore()` (`wallet_withdrawals`, con
 *   topes y ventanas en `America/Santiago` del lado SQL, donde la carrera de
 *   dos lambdas se corta con un lock);
 * - pruebas / demo: `createInMemoryWithdrawalStore()`, un `Map` por usuario.
 *
 * Reglas que este archivo hace cumplir y que no se pueden relajar:
 *
 * 1. Idempotencia por `(userId, requestId)`: el mismo `requestId` con los
 *    mismos datos devuelve la MISMA fila; con datos distintos es conflicto, no
 *    una segunda salida.
 * 2. El envío se reclama una sola vez (`claimSubmit` atómico). El segundo
 *    llamado NO reenvía: devuelve la firma ya reclamada. Una transacción firmada
 *    jamás se transmite dos veces (el RPC respondería "already processed" o,
 *    peor, nadie sabe qué pasó con la primera).
 * 3. Falla cerrado ANTES de transmitir: si el movimiento no queda escrito en el
 *    libro, la transacción no sale. Sin registro no hay auditoría.
 * 4. Si el RPC falla de forma ambigua (timeout, 502, rate limit) el retiro queda
 *    `submitted` con su firma conocida: se consulta la cadena después en vez de
 *    reintentar a ciegas. Si el RPC rechaza la simulación, se marca `failed` con
 *    el mensaje traducido y no se toca nada más.
 * 5. M57: este módulo NO importa `@/lib/supabase/admin`. El cliente admin vive
 *    sólo en `lib/services/*.supabase.ts`; acá se consumen sus funciones.
 */

export type WithdrawalStatus =
  | "reserved"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired"
  | "released";

export interface WithdrawalRecord {
  id: string;
  userId: string;
  requestId: string;
  reference: string;
  mint: string;
  symbol: string;
  sourceAddress: string;
  destinationAddress: string;
  amountUi: number;
  amountUsd: number;
  builtTransactionBase64: string;
  status: WithdrawalStatus;
  signature: string | null;
  error: string | null;
  expiresAt: string; // ISO
  createdAt: string; // ISO
  confirmedAt: string | null;
}

export interface ReserveWithdrawalInput {
  userId: string;
  requestId: string;
  reference: string;
  mint: string;
  symbol: string;
  sourceAddress: string;
  destinationAddress: string;
  amountUi: number;
  amountUsd: number;
  builtTransactionBase64: string;
  expiresAt: string; // ISO
}

export interface ReserveWithdrawalResult {
  id: string;
  expiresAt: string;
}

export interface ClaimWithdrawalResult {
  id: string;
  status: WithdrawalStatus;
  signature: string | null;
  claimed: boolean;
}

export interface WithdrawalStore {
  reserve(input: ReserveWithdrawalInput): Promise<ReserveWithdrawalResult>;
  claimSubmit(
    userId: string,
    requestId: string,
    signature: string,
  ): Promise<ClaimWithdrawalResult | null>;
  finalize(
    userId: string,
    requestId: string,
    status: WithdrawalStatus,
    signature?: string | null,
    error?: string | null,
  ): Promise<boolean>;
  read(userId: string, requestId: string): Promise<WithdrawalRecord | null>;
}

/**
 * Topes de salida del producto. El store SQL los aplica con las mismas cifras y
 * ventanas `America/Santiago`; acá se replican para que el store en memoria y
 * los mensajes de error digan lo mismo que la base.
 */
const WITHDRAWAL_LIMIT_ORDER_USD = 500;
const WITHDRAWAL_LIMIT_DAILY_USD = 500;
const WITHDRAWAL_LIMIT_MONTHLY_USD = 2_000;

const MOVEMENT_NOT_RECORDED = "No pudimos registrar el retiro en el libro.";
const NOTHING_SENT = "No pudimos registrar el retiro. No se envió nada.";

function formatUsd(value: number): string {
  // Formato chileno: separador de miles con punto, sin decimales si es entero.
  return Number.isInteger(value)
    ? value.toLocaleString("es-CL")
    : value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Código SQL de `wallet_withdrawals` → error de dominio de la API.
 *
 * El store de Supabase traduce el error de PostgREST a un texto que CONTIENE el
 * código (`MV_LIMIT_DAILY`, ...). El código se busca dentro del mensaje y no se
 * compara por igualdad: el mensaje puede venir con prefijo de Postgres
 * (`new row violates ...`) o con el detalle de la restricción. Si ya es un
 * `DomainError` se devuelve tal cual (no se re-envuelve ni se pierde el código).
 *
 * Los mensajes de límites son accionables: dicen el tope y qué hacer, porque el
 * usuario no puede adivinar cuál de los tres topes tocó.
 */
export function mapWithdrawalError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const text = String((error as Error)?.message ?? error);

  if (text.includes("MV_LIMIT_ORDER")) {
    return new DomainError(
      "LIMIT_ORDER",
      `El tope por salida es US$${formatUsd(WITHDRAWAL_LIMIT_ORDER_USD)}. Divide el envío en partes.`,
    );
  }
  if (text.includes("MV_LIMIT_DAILY")) {
    return new DomainError(
      "LIMIT_DAILY",
      `El tope diario de salidas es US$${formatUsd(WITHDRAWAL_LIMIT_DAILY_USD)}. Divide el envío en varios días o inténtalo mañana.`,
    );
  }
  if (text.includes("MV_LIMIT_MONTHLY")) {
    return new DomainError(
      "LIMIT_MONTHLY",
      `El tope mensual de salidas es US$${formatUsd(WITHDRAWAL_LIMIT_MONTHLY_USD)}. Inténtalo el próximo mes.`,
    );
  }
  if (text.includes("MV_LIMIT_GLOBAL")) {
    return new DomainError(
      "LIMIT_GLOBAL",
      "Alcanzamos el tope global de salidas del día. Inténtalo mañana.",
    );
  }
  if (text.includes("MV_WITHDRAWAL_EXPIRED")) {
    return new DomainError("QUOTE_EXPIRED", "La solicitud de retiro venció. Arma el envío de nuevo.");
  }
  if (text.includes("MV_WITHDRAWAL_CONFLICT")) {
    return new DomainError(
      "VALIDATION",
      "Ese retiro ya se registró con otros datos. Arma el envío de nuevo.",
    );
  }
  if (text.includes("MV_WITHDRAWAL_INVALID")) {
    return new DomainError("VALIDATION", "Los datos del retiro no son válidos. Arma el envío de nuevo.");
  }
  return new DomainError("UPSTREAM", NOTHING_SENT);
}

/**
 * Estado del retiro → estado de `Order` (`orderStatusSchema`).
 *
 * `reserved` se mapea a `submitted` y `released` a `expired` porque `Order` no
 * tiene esos estados: el cliente ya tiene una transacción armada esperando firma
 * (para él es "enviada y pendiente"), y una reserva liberada es, desde su punto
 * de vista, una solicitud que venció sin mover plata. No se inventan estados
 * nuevos: el contrato de la API lo valida con `orderStatusSchema`.
 */
function toOrderStatus(status: WithdrawalStatus): Order["status"] {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "failed":
      return "failed";
    case "expired":
    case "released":
      return "expired";
    case "submitted":
    case "reserved":
      return "submitted";
  }
  // Estado fuera del contrato (fila corrupta): se reporta como pendiente. Decir
  // "confirmado" afirmaría que la plata llegó y decir "fallido" invitaría a
  // reintentar; ninguno de los dos se puede sostener sin evidencia.
  return "submitted";
}

/** `true` si el texto es base64 (estándar o url-safe) y decodifica a algo. */
function isNonEmptyBase64(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text === "") return false;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(text)) return false;
  return Buffer.from(text, "base64").length > 0;
}

function isoMs(value: string): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

/**
 * Clave de ventana en UTC (`YYYY-MM-DD` / `YYYY-MM`).
 *
 * El store SQL cuenta con ventanas `America/Santiago` (misma zona que los topes
 * de trading). El store en memoria es de pruebas y desarrollo, donde un día
 * calendario UTC es suficiente y, sobre todo, determinista: no depende de la
 * base de zonas del runtime. Producción nunca usa esta ventana.
 */
function utcWindowKey(ms: number, scope: "day" | "month"): string | null {
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return scope === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

/**
 * ¿La fila compromete cupo? `submitted` y `confirmed` son plata que salió (o
 * está saliendo); una reserva vigente todavía puede firmarse. `failed`,
 * `expired` y `released` no movieron fondos y no deben consumir topes, o un
 * error de red dejaría al usuario sin poder reintentar en todo el día.
 */
function countsTowardLimits(record: WithdrawalRecord, nowMs: number): boolean {
  if (record.status === "submitted" || record.status === "confirmed") return true;
  if (record.status !== "reserved") return false;
  const expiresMs = isoMs(record.expiresAt);
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

function cloneRecord(record: WithdrawalRecord): WithdrawalRecord {
  return { ...record };
}

/**
 * Store en memoria: un `Map` por usuario (clave = `requestId`).
 *
 * Es determinista a propósito (ids `wdr_mem_<n>`, sin `randomUUID`) para que las
 * pruebas puedan afirmar sobre la secuencia. La atomicidad de `claimSubmit` es
 * trivial acá (no hay `await` entre la lectura y la escritura), pero la
 * INTERFAZ es la misma que la del store SQL, que sí necesita un
 * compare-and-set en la base: el dominio no debe depender de cuál está detrás.
 */
export function createInMemoryWithdrawalStore(): WithdrawalStore {
  const books = new Map<string, Map<string, WithdrawalRecord>>();
  let sequence = 0;

  const bookFor = (userId: string): Map<string, WithdrawalRecord> => {
    const existing = books.get(userId);
    if (existing) return existing;
    const created = new Map<string, WithdrawalRecord>();
    books.set(userId, created);
    return created;
  };

  const findRecord = (userId: string, key: string): WithdrawalRecord | null => {
    const book = books.get(userId);
    if (!book) return null;
    const byRequestId = book.get(key);
    if (byRequestId) return byRequestId;
    // `read` acepta la clave de idempotencia O el id de la fila: la ruta de
    // estado sólo conoce el id que devolvió `build`.
    for (const record of book.values()) {
      if (record.id === key) return record;
    }
    return null;
  };

  const requireText = (value: string): string => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") throw new Error("MV_WITHDRAWAL_INVALID");
    return text;
  };

  return {
    async reserve(input: ReserveWithdrawalInput): Promise<ReserveWithdrawalResult> {
      const userId = requireText(input.userId);
      const requestId = requireText(input.requestId);
      requireText(input.reference);
      requireText(input.mint);
      requireText(input.builtTransactionBase64);
      if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
        throw new Error("MV_WITHDRAWAL_INVALID");
      }
      if (!Number.isFinite(input.amountUi) || input.amountUi <= 0) {
        throw new Error("MV_WITHDRAWAL_INVALID");
      }
      const expiresMs = isoMs(input.expiresAt);
      if (!Number.isFinite(expiresMs)) throw new Error("MV_WITHDRAWAL_INVALID");

      const book = bookFor(userId);
      const nowMs = Date.now();

      // Idempotencia primero: un reintento del MISMO requestId no debe liberar ni
      // reescribir su propia reserva. Si sigue vigente y con los mismos datos se
      // devuelve idéntica; cualquier otra cosa es conflicto (nunca una segunda
      // salida con la misma clave).
      const existing = book.get(requestId);
      if (existing) {
        const vigente = existing.status === "reserved" && isoMs(existing.expiresAt) > nowMs;
        const mismosDatos =
          existing.amountUsd === input.amountUsd &&
          existing.destinationAddress === input.destinationAddress;
        if (vigente && mismosDatos) {
          return { id: existing.id, expiresAt: existing.expiresAt };
        }
        throw new Error("MV_WITHDRAWAL_CONFLICT");
      }

      // Una reserva nueva reemplaza a la anterior del mismo usuario (D-06): si no,
      // armar el envío dos veces apilaría topes contra el usuario. La fila vieja
      // queda `released`, no borrada: es evidencia de que existió una tx armada.
      for (const record of book.values()) {
        if (record.requestId !== requestId && record.status === "reserved") {
          record.status = "released";
        }
      }

      // Topes en orden: por salida → diario → mensual (el más específico primero,
      // para que el mensaje apunte a la causa real).
      if (input.amountUsd > WITHDRAWAL_LIMIT_ORDER_USD) throw new Error("MV_LIMIT_ORDER");

      const dayKey = utcWindowKey(nowMs, "day");
      const monthKey = utcWindowKey(nowMs, "month");
      let daySpent = 0;
      let monthSpent = 0;
      for (const record of book.values()) {
        if (!countsTowardLimits(record, nowMs)) continue;
        const createdMs = isoMs(record.createdAt);
        if (utcWindowKey(createdMs, "day") === dayKey) daySpent += record.amountUsd;
        if (utcWindowKey(createdMs, "month") === monthKey) monthSpent += record.amountUsd;
      }
      if (daySpent + input.amountUsd > WITHDRAWAL_LIMIT_DAILY_USD) throw new Error("MV_LIMIT_DAILY");
      if (monthSpent + input.amountUsd > WITHDRAWAL_LIMIT_MONTHLY_USD) {
        throw new Error("MV_LIMIT_MONTHLY");
      }

      sequence += 1;
      const record: WithdrawalRecord = {
        id: `wdr_mem_${sequence}`,
        userId,
        requestId,
        reference: input.reference.trim(),
        mint: input.mint.trim(),
        symbol: typeof input.symbol === "string" ? input.symbol.trim() : "",
        sourceAddress: input.sourceAddress,
        destinationAddress: input.destinationAddress,
        amountUi: input.amountUi,
        amountUsd: input.amountUsd,
        builtTransactionBase64: input.builtTransactionBase64,
        status: "reserved",
        signature: null,
        error: null,
        expiresAt: new Date(expiresMs).toISOString(),
        createdAt: new Date(nowMs).toISOString(),
        confirmedAt: null,
      };
      book.set(requestId, record);
      return { id: record.id, expiresAt: record.expiresAt };
    },

    async claimSubmit(
      userId: string,
      requestId: string,
      signature: string,
    ): Promise<ClaimWithdrawalResult | null> {
      const record = books.get(userId)?.get(requestId);
      if (!record) return null;

      // Ya reclamada: el segundo llamado NO gana el envío. Devuelve la misma
      // firma y el estado actual para que el llamador responda idempotente.
      if (
        record.status === "submitted" ||
        record.status === "confirmed" ||
        record.status === "failed"
      ) {
        return { id: record.id, status: record.status, signature: record.signature, claimed: false };
      }
      if (record.status === "released" || record.status === "expired") {
        throw new Error("MV_WITHDRAWAL_EXPIRED");
      }
      if (!(isoMs(record.expiresAt) > Date.now())) throw new Error("MV_WITHDRAWAL_EXPIRED");

      record.status = "submitted";
      record.signature = signature;
      return { id: record.id, status: "submitted", signature, claimed: true };
    },

    async finalize(
      userId: string,
      requestId: string,
      status: WithdrawalStatus,
      signature?: string | null,
      error?: string | null,
    ): Promise<boolean> {
      const record = books.get(userId)?.get(requestId);
      if (!record) return false;
      // Sólo se cierra un retiro vivo. Un `confirmed` no se puede volver `failed`
      // por un reporte tardío, y un `released` no se resucita.
      if (record.status !== "reserved" && record.status !== "submitted") return false;
      record.status = status;
      if (signature !== undefined) record.signature = signature;
      if (error !== undefined) record.error = error;
      if (status === "confirmed") record.confirmedAt = new Date().toISOString();
      return true;
    },

    async read(userId: string, requestId: string): Promise<WithdrawalRecord | null> {
      const key = typeof requestId === "string" ? requestId.trim() : "";
      if (key === "") return null;
      const record = findRecord(userId, key);
      // Copia: quien lee no muta el libro por accidente.
      return record ? cloneRecord(record) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton de proceso
// ---------------------------------------------------------------------------

let injectedStore: WithdrawalStore | null = null;
let defaultStore: WithdrawalStore | null = null;

/**
 * Store por defecto del proceso. Es perezoso a propósito: construir el cliente
 * de Supabase al importar rompería el arranque de módulos que no retiran nada
 * (y las pruebas que nunca tocan la base).
 */
export function getDefaultWithdrawalStore(): WithdrawalStore {
  if (injectedStore) return injectedStore;
  if (!defaultStore) defaultStore = createSupabaseWithdrawalStore();
  return defaultStore;
}

/**
 * Inyecta un store de pruebas. `null` vuelve al store real (y NO lo reconstruye:
 * el que ya existía se reutiliza).
 */
export function setWithdrawalStoreForTests(store: WithdrawalStore | null): void {
  injectedStore = store;
}

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

/**
 * Reserva cupo para una salida ya armada.
 *
 * El `symbol` se completa desde el catálogo: la ruta de `/send/build` conoce el
 * mint, no siempre el ticker, y el libro tiene que poder mostrar la salida sin
 * volver a resolver el mint en la lectura. USDC no está en `TICKERS`, así que va
 * aparte.
 */
export async function reserveWithdrawal(
  input: ReserveWithdrawalInput,
  deps?: { store?: WithdrawalStore },
): Promise<ReserveWithdrawalResult> {
  const store = deps?.store ?? getDefaultWithdrawalStore();
  const mint = typeof input.mint === "string" ? input.mint.trim() : "";
  if (mint === "") {
    throw new DomainError("VALIDATION", "Falta el activo del retiro.");
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new DomainError("VALIDATION", "El monto del retiro no es válido.");
  }
  if (!Number.isFinite(isoMs(input.expiresAt))) {
    throw new DomainError("VALIDATION", "La solicitud de retiro no trae un vencimiento válido.");
  }

  const symbol =
    (typeof input.symbol === "string" ? input.symbol.trim() : "") ||
    tickerByMint(mint)?.symbol ||
    (mint === USDC_MINT ? "USDC" : "");

  try {
    return await store.reserve({ ...input, mint, symbol });
  } catch (error) {
    throw mapWithdrawalError(error);
  }
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/** Transmisión por defecto: RPC del servidor, con simulación previa. */
function defaultSendRawTransaction(rawTx: Uint8Array): Promise<string> {
  return getServerConnection().sendRawTransaction(Buffer.from(rawTx), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
}

type SendOutcome = { ok: true; signature: string } | { ok: false; error: unknown };

/**
 * Envuelve la transmisión sin dejar que el error escape: el fallo del RPC se
 * decide DESPUÉS (timeout vs rechazo), y un throw síncrono del cliente también
 * tiene que caer en la misma decisión.
 */
async function trySendRaw(
  send: (rawTx: Uint8Array) => Promise<string>,
  rawTx: Uint8Array,
): Promise<SendOutcome> {
  try {
    return { ok: true, signature: await send(rawTx) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function defaultGetSignatureStatuses(
  signatures: string[],
): Promise<Array<SignatureStatusLike | null>> {
  const response = await getServerConnection().getSignatureStatuses(signatures, {
    searchTransactionHistory: true,
  });
  return response.value;
}

/**
 * `finalize` best effort. Que falle la escritura del estado no debe convertir un
 * envío exitoso en un error para el usuario: `claimSubmit` ya dejó la fila en
 * `submitted` con la firma, así que el estado guardado sigue siendo correcto.
 */
async function finalizeQuietly(
  store: WithdrawalStore,
  userId: string,
  requestId: string,
  status: WithdrawalStatus,
  signature?: string | null,
  error?: string | null,
): Promise<boolean> {
  try {
    return await store.finalize(userId, requestId, status, signature, error);
  } catch {
    return false;
  }
}

/**
 * Marca el movimiento como fallido cuando el RPC rechazó la transacción.
 *
 * Si el llamador inyectó su propio escritor de movimientos (pruebas, demo), NO se
 * toca el libro real: la fila de prueba no existe en `wallet_movements` y
 * escribirla sería un efecto de red escondido en un test.
 */
async function markMovementFailed(reference: string, injectedWriter: boolean): Promise<void> {
  if (injectedWriter) return;
  try {
    await updateWalletMovementStatus(reference, "failed");
  } catch {
    // Best effort: el retiro ya está en `failed`; el movimiento se reconcilia después.
  }
}

/**
 * Reclama y transmite una salida firmada. Pasos, en orden y sin saltarse ninguno:
 *
 * 1. Leer el retiro. Sin fila (o liberada) no hay nada que enviar.
 * 2. Si ya se envió, devolver lo guardado SIN reenviar. Una transacción firmada
 *    se transmite una sola vez: reenviarla puede duplicar la salida.
 * 3. Vencimiento: una tx con blockhash viejo no sirve, y aceptarla dejaría el
 *    cupo tomado por algo que nunca va a aterrizar.
 * 4. Integridad: el mensaje de la tx firmada debe ser el que armó el servidor
 *    (si no, el cliente firmó otra cosa con el mismo requestId).
 * 5. La firma se deriva del propio binario; sin firma no hay evidencia ni claim.
 * 6. Claim atómico: sólo el primero transmite.
 * 7. Escribir el movimiento ANTES de transmitir. Si el libro no registra la
 *    salida, no sale: falla cerrado.
 * 8. Transmitir. Timeout/5xx deja el retiro `submitted` con firma (se consulta la
 *    cadena después); un rechazo de simulación lo deja `failed` con el mensaje
 *    traducido, sin reintento ciego.
 * 9. Firma del RPC = firma definitiva.
 */
export async function submitWithdrawal(
  input: { userId: string; requestId: string; signedTransactionBase64: string },
  deps?: {
    store?: WithdrawalStore;
    sendRawTransaction?: (rawTx: Uint8Array) => Promise<string>;
    upsertMovement?: (row: {
      userId: string;
      kind: "withdraw";
      mint: string;
      amountUi: number;
      reference: string;
      status: "pending" | "confirmed" | "failed";
      signature: string | null;
      counterpartyAddress: string | null;
    }) => Promise<boolean>;
  },
): Promise<TradeSubmitResponse> {
  const store = deps?.store ?? getDefaultWithdrawalStore();
  const writeMovement = deps?.upsertMovement ?? upsertWalletMovement;
  const sendRaw = deps?.sendRawTransaction ?? defaultSendRawTransaction;
  const userId = typeof input.userId === "string" ? input.userId : "";
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  const signedTransactionBase64 =
    typeof input.signedTransactionBase64 === "string" ? input.signedTransactionBase64.trim() : "";

  // 1
  const record = await store.read(userId, requestId);
  if (!record || record.status === "released") {
    throw new DomainError("NOT_FOUND", "No encontramos ese retiro.");
  }

  // 2
  const stored = record.status;
  if (stored === "submitted" || stored === "confirmed" || stored === "failed") {
    if (!isNonEmptyBase64(signedTransactionBase64)) {
      throw new DomainError("VALIDATION", "Falta la transacción firmada.");
    }
    // Idempotencia hacia el cliente: la misma respuesta, sin transmitir de nuevo.
    return { orderId: record.id, signature: record.signature, status: stored };
  }

  // 3
  const expiresMs = isoMs(record.expiresAt);
  if (!Number.isFinite(expiresMs) || Date.now() >= expiresMs) {
    throw new DomainError("QUOTE_EXPIRED", "La solicitud de retiro venció. Arma el envío de nuevo.");
  }

  // 4 (sus errores ya son DomainError: no se envuelven)
  await assertSignedTransactionMatchesBuilt(
    record.builtTransactionBase64,
    signedTransactionBase64,
  );

  // 5
  const signature = await readTransactionSignature(signedTransactionBase64);
  if (!signature) {
    throw new DomainError("VALIDATION", "La transacción no está firmada.");
  }

  // 6
  let claim: ClaimWithdrawalResult | null = null;
  try {
    claim = await store.claimSubmit(userId, record.requestId, signature);
  } catch (error) {
    throw mapWithdrawalError(error);
  }
  if (!claim) {
    throw new DomainError("NOT_FOUND", "No encontramos ese retiro.");
  }
  if (!claim.claimed) {
    return { orderId: claim.id, signature: claim.signature, status: toOrderStatus(claim.status) };
  }
  const claimed = claim;

  // 7
  let recorded = false;
  try {
    recorded = await writeMovement({
      userId: record.userId,
      kind: "withdraw",
      mint: record.mint,
      amountUi: record.amountUi,
      reference: record.reference,
      status: "pending",
      signature,
      counterpartyAddress: record.destinationAddress,
    });
  } catch {
    recorded = false;
  }
  if (!recorded) {
    // Sin fila en el libro no se transmite: no habría cómo auditar la salida ni
    // cómo conciliarla si el RPC contesta mal.
    await finalizeQuietly(store, userId, record.requestId, "failed", signature, MOVEMENT_NOT_RECORDED);
    throw new DomainError("UPSTREAM", `${MOVEMENT_NOT_RECORDED} No se envió nada.`);
  }

  // 8
  const sent = await trySendRaw(
    sendRaw,
    new Uint8Array(Buffer.from(signedTransactionBase64, "base64")),
  );
  if (!sent.ok) {
    const translated = translateSolanaError(sent.error);
    if (translated.retryable === true || translated.category === "rpc_timeout") {
      // Ambigüedad: la tx PUDO haber llegado. Se deja `submitted` con la firma
      // conocida; la conciliación consulta la cadena. Nunca se reenvía.
      await finalizeQuietly(store, userId, record.requestId, "submitted", signature, null);
      throw new DomainError(
        "UPSTREAM",
        "No pudimos enviar el retiro. Revisa tu actividad antes de reintentar.",
      );
    }
    // Rechazo determinista (simulación/instrucción): la tx no se ejecutó. Se
    // cierra como `failed` con el mensaje traducido y el libro queda consistente.
    await finalizeQuietly(
      store,
      userId,
      record.requestId,
      "failed",
      signature,
      translated.userMessage,
    );
    await markMovementFailed(record.reference, deps?.upsertMovement !== undefined);
    return { orderId: claimed.id, signature, status: "failed" };
  }

  // 9
  const finalSignature = sent.signature || signature;
  await finalizeQuietly(store, userId, record.requestId, "submitted", finalSignature, null);
  return { orderId: claimed.id, signature: finalSignature, status: "submitted" };
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

async function defaultUpdateMovementStatus(
  reference: string,
  status: "confirmed" | "failed",
): Promise<boolean> {
  return updateWalletMovementStatus(reference, status);
}

async function updateMovementQuietly(
  updater: (reference: string, status: "confirmed" | "failed") => Promise<boolean>,
  reference: string,
  status: "confirmed" | "failed",
): Promise<void> {
  try {
    await updater(reference, status);
  } catch {
    // Best effort: perder la actualización del movimiento no cambia lo que
    // pasó en la cadena; el libro de retiros ya quedó con el estado final.
  }
}

/**
 * Estado de un retiro como `Order` (contrato de `GET /api/wallet/send/status`).
 *
 * Sólo se consulta la cadena cuando el retiro está `submitted` y tiene firma:
 * un `reserved` no tiene nada que buscar y un `failed`/`confirmed` ya es
 * definitivo (no se pisa un estado final con una lectura tardía).
 *
 * Si el RPC falla se devuelve el estado GUARDADO sin modificarlo. Un error de
 * lectura no es evidencia de que la transacción no exista: marcarla `failed`
 * ahí sí perdería plata del usuario de vista.
 */
export async function getWithdrawalStatus(
  input: { userId: string; id: string },
  deps?: {
    store?: WithdrawalStore;
    getSignatureStatuses?: (sigs: string[]) => Promise<Array<SignatureStatusLike | null>>;
    updateMovementStatus?: (reference: string, status: "confirmed" | "failed") => Promise<boolean>;
  },
): Promise<Order> {
  const store = deps?.store ?? getDefaultWithdrawalStore();
  const getStatuses = deps?.getSignatureStatuses ?? defaultGetSignatureStatuses;
  const updateMovement = deps?.updateMovementStatus ?? defaultUpdateMovementStatus;
  const userId = typeof input.userId === "string" ? input.userId : "";
  const key = typeof input.id === "string" ? input.id.trim() : "";

  let record: WithdrawalRecord | null = null;
  try {
    record = await store.read(userId, key);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("UPSTREAM", "No pudimos consultar tu retiro. Intenta de nuevo en un momento.");
  }
  if (!record) {
    throw new DomainError("NOT_FOUND", "No encontramos ese retiro.");
  }

  let nextStatus = toOrderStatus(record.status);
  let failureMessage = record.error;

  const signatureValue = typeof record.signature === "string" ? record.signature.trim() : "";
  if (record.status === "submitted" && signatureValue !== "") {
    let decision: ReturnType<typeof signatureStatusToOrder> | null = null;
    let rpcStatus: SignatureStatusLike | null = null;
    try {
      const statuses = await getStatuses([signatureValue]);
      rpcStatus = statuses.length > 0 ? (statuses[0] ?? null) : null;
      decision = signatureStatusToOrder(rpcStatus);
    } catch {
      decision = null; // RPC caído: se responde con lo guardado, sin pisarlo.
    }

    if (decision && decision.status === "confirmed") {
      // `confirmed` sin `err` = la transferencia se asentó.
      await finalizeQuietly(store, record.userId, record.requestId, "confirmed", signatureValue, null);
      await updateMovementQuietly(updateMovement, record.reference, "confirmed");
      nextStatus = "confirmed";
      failureMessage = null;
    } else if (decision && decision.status === "failed") {
      const translated = translateSolanaError(rpcStatus?.err);
      await finalizeQuietly(
        store,
        record.userId,
        record.requestId,
        "failed",
        signatureValue,
        translated.userMessage,
      );
      await updateMovementQuietly(updateMovement, record.reference, "failed");
      nextStatus = "failed";
      failureMessage = translated.userMessage;
    }
  }

  return {
    id: record.id,
    userId: record.userId,
    side: "sell",
    symbol: record.symbol as Order["symbol"],
    inAmountUi: record.amountUi,
    outAmountUi: record.amountUsd,
    feeBps: 0,
    status: nextStatus,
    signature: record.signature,
    ...(failureMessage ? { error: failureMessage } : {}),
    createdAt: record.createdAt,
  };
}
