import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase/schema-error";
import type {
  ClaimWithdrawalResult,
  ReserveWithdrawalResult,
  WithdrawalStore,
} from "@/lib/wallet/withdrawal-store";

/**
 * Libro de retiros (`wallet_withdrawals`, migración 0051).
 *
 * Vive en `lib/services/*.supabase.ts` porque necesita el cliente admin
 * (M57): la clave de servidor no sale de la lista blanca. La lógica de
 * negocio y la traducción a `DomainError` están en
 * `lib/wallet/withdrawal-store.ts`; acá sólo se habla con Supabase.
 *
 * Las cuatro RPC son la única puerta a la tabla:
 *
 * - `reserve_wallet_withdrawal` deja UNA sola reserva viva por usuario y es
 *   idempotente por `request_id`. Si se llamara a `INSERT` desde acá, un
 *   reintento del cliente podría abrir dos salidas del mismo saldo; por eso
 *   la atomicidad (locks + topes + unicidad) se resuelve en SQL y este módulo
 *   nunca la reimplementa ni la reintenta con otra estrategia.
 * - `claim_wallet_withdrawal_submit` marca el envío UNA vez: el segundo
 *   llamador recibe `claimed = false` con el estado real ya persistido. Ese
 *   `false` no es un fallo, es la idempotencia funcionando.
 * - `finalize_wallet_withdrawal` cierra la reserva (confirmada, fallida,
 *   vencida o liberada) sin volver a mover topes.
 * - `read_wallet_withdrawal` es la lectura por usuario, para el estado.
 *
 * Ningún mensaje de PostgREST llega al cliente. Un error crudo filtraría el
 * nombre de la función, el SQLSTATE o detalles de la fila; y "la función no
 * existe" vs. "el tope se pasó" son casos distintos: el primero es despliegue
 * (falla cerrado con un código propio) y el segundo es una regla de negocio.
 * Este módulo los reduce a un código estable y nada más.
 */

type UnknownRow = Record<string, unknown>;

/** Migración requerida. Sin ella el retiro real queda bloqueado. */
export const WITHDRAWAL_MIGRATION = "0051_wallet_withdrawals.sql";

const RPC_RESERVE = "reserve_wallet_withdrawal";
const RPC_CLAIM_SUBMIT = "claim_wallet_withdrawal_submit";
const RPC_FINALIZE = "finalize_wallet_withdrawal";
const RPC_READ = "read_wallet_withdrawal";

/** Código de despliegue: falta la migración, el reintento no lo arregla. */
const MIGRATION_MISSING = "MV_WITHDRAWAL_MIGRATION_MISSING";

/** Cualquier otro fallo de la base. Nunca se agrega detalle técnico. */
const UPSTREAM_FAILED = "MV_WITHDRAWAL_UPSTREAM";

/**
 * Códigos que la 0051 levanta con `RAISE EXCEPTION` y que el dominio necesita
 * distinguir. Se comparan tal cual contra el texto del error para devolver el
 * código EXACTO que espera `withdrawal-store`.
 */
const KNOWN_CODES = [
  "MV_LIMIT_ORDER",
  "MV_LIMIT_DAILY",
  "MV_LIMIT_MONTHLY",
  "MV_LIMIT_GLOBAL",
  "MV_WITHDRAWAL_EXPIRED",
  "MV_WITHDRAWAL_CONFLICT",
  "MV_WITHDRAWAL_INVALID",
] as const;

const WITHDRAWAL_STATUSES = [
  "reserved",
  "submitted",
  "confirmed",
  "failed",
  "expired",
  "released",
] as const;

type WithdrawalRowStatus = (typeof WITHDRAWAL_STATUSES)[number];

export interface StoredWithdrawalRecord {
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
  status: WithdrawalRowStatus;
  signature: string | null;
  error: string | null;
  expiresAt: string;
  createdAt: string;
  confirmedAt: string | null;
}

export interface ReserveWithdrawalRowInput {
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
  expiresAt: string;
}

type QueryError = { code?: string; message?: string; details?: string; hint?: string } | null;

/**
 * Traduce un error de PostgREST a uno de tres códigos y descarta el original.
 * `never`: quien lo llama no sigue después de un error.
 */
function withdrawalStoreError(error: QueryError): never {
  // Falta la tabla o la función (migración sin aplicar). Se evalúa primero
  // porque es el único caso donde "no existe" es la causa real y no una
  // regla de negocio disfrazada.
  if (isMissingSchemaError(error)) {
    throw new Error(MIGRATION_MISSING);
  }

  // PostgREST puede devolver el 42883 con otro texto según versión: se mira el
  // mensaje además del código para no confundirlo con un fallo de datos.
  const raw = error?.message ?? "";
  const message = raw.toLowerCase();
  if (
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist"))
  ) {
    throw new Error(MIGRATION_MISSING);
  }

  for (const code of KNOWN_CODES) {
    if (message.includes(code.toLowerCase())) throw new Error(code);
  }

  throw new Error(UPSTREAM_FAILED);
}

function firstRow(data: unknown): UnknownRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as UnknownRow) : null;
  }
  return data && typeof data === "object" ? (data as UnknownRow) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Numérico de PostgREST puede venir como number o como texto. */
function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Timestamptz se normaliza a ISO para poder compararlo como texto. */
function asIsoString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function asStatus(value: unknown): WithdrawalRowStatus | null {
  if (typeof value !== "string") return null;
  const candidate = WITHDRAWAL_STATUSES.find((status) => status === value);
  return candidate ?? null;
}

/**
 * Fila snake_case → camelCase. Un campo obligatorio ausente o de tipo
 * inesperado se rechaza con `MV_WITHDRAWAL_INVALID`: una fila a medio escribir
 * no se completa con valores inventados (un monto 0 pasaría cualquier tope).
 */
function toStoredRecord(row: UnknownRow): StoredWithdrawalRecord {
  // La RPC de lectura devuelve la tabla tal cual; los alias con prefijo son
  // los que usa `claim_wallet_withdrawal_submit` en su propio `RETURNS TABLE`.
  const id = asString(row.id ?? row.withdrawal_id);
  const userId = asString(row.user_id);
  const requestId = asString(row.request_id);
  const reference = asString(row.reference);
  const mint = asString(row.mint);
  const symbol = asString(row.symbol);
  const sourceAddress = asString(row.source_address);
  const destinationAddress = asString(row.destination_address);
  const amountUi = asNumber(row.amount_ui);
  const amountUsd = asNumber(row.amount_usd);
  // La columna real de la 0051 es `built_transaction_base64`; `built_tx` es el
  // nombre del parámetro de la RPC, se acepta por si otra migración lo usa.
  const builtTransactionBase64 = asString(
    row.built_transaction_base64 ?? row.built_tx ?? row.built_transaction,
  );
  const status = asStatus(row.status ?? row.withdrawal_status);
  const expiresAt = asIsoString(row.expires_at);
  const createdAt = asIsoString(row.created_at);
  const confirmedAt = asIsoString(row.confirmed_at);

  const required = [
    id,
    userId,
    requestId,
    reference,
    mint,
    symbol,
    sourceAddress,
    destinationAddress,
    builtTransactionBase64,
  ];
  const complete = required.every((value) => value !== "");
  if (
    !complete ||
    status === null ||
    expiresAt === null ||
    createdAt === null ||
    !Number.isFinite(amountUi) ||
    amountUi <= 0 ||
    !Number.isFinite(amountUsd) ||
    amountUsd <= 0
  ) {
    throw new Error("MV_WITHDRAWAL_INVALID");
  }

  return {
    id,
    userId,
    requestId,
    reference,
    mint,
    symbol,
    sourceAddress,
    destinationAddress,
    amountUi,
    amountUsd,
    builtTransactionBase64,
    status,
    signature: asNullableString(row.signature),
    error: asNullableString(row.error),
    expiresAt,
    createdAt,
    confirmedAt,
  };
}

/**
 * Reserva una salida. Idempotente por `requestId`: el mismo par
 * (usuario, requestId) devuelve la misma reserva en vez de abrir otra. Si el
 * usuario ya tiene una reserva viva, la RPC levanta `MV_WITHDRAWAL_CONFLICT`
 * (o el tope que corresponda) y acá se propaga sólo el código.
 */
export async function reserveWithdrawalRow(
  input: ReserveWithdrawalRowInput,
): Promise<ReserveWithdrawalResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc(RPC_RESERVE, {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_reference: input.reference,
    p_mint: input.mint,
    p_symbol: input.symbol,
    p_source_address: input.sourceAddress,
    p_destination_address: input.destinationAddress,
    p_amount_ui: input.amountUi,
    p_amount_usd: input.amountUsd,
    p_built_tx: input.builtTransactionBase64,
    p_expires_at: input.expiresAt,
  });
  if (error) withdrawalStoreError(error);

  const row = firstRow(data);
  const id = asString(row?.withdrawal_id ?? row?.id);
  const expiresAt = asIsoString(row?.reserved_expires_at ?? row?.expires_at);
  // La reserva siempre devuelve su fila: si vuelve vacía, la base aceptó la
  // llamada sin dejar rastro y continuar sería enviar sin cupo reservado.
  if (!row || id === "" || expiresAt === null) throw new Error("MV_WITHDRAWAL_INVALID");

  return { id, expiresAt };
}

/**
 * Reclama el envío una sola vez. `null` = la RPC no devolvió fila (no hay
 * reserva para ese usuario/requestId); `claimed = false` = otro llamador ya
 * la reclamó y se devuelve el estado real persistido, no un error.
 */
export async function claimWithdrawalSubmitRow(
  userId: string,
  requestId: string,
  signature: string,
): Promise<ClaimWithdrawalResult | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc(RPC_CLAIM_SUBMIT, {
    p_user_id: userId,
    p_request_id: requestId,
    p_signature: signature,
  });
  if (error) withdrawalStoreError(error);

  const row = firstRow(data);
  if (!row) return null;

  const id = asString(row.withdrawal_id ?? row.id);
  const status = asStatus(row.withdrawal_status ?? row.status);
  if (id === "" || status === null) throw new Error("MV_WITHDRAWAL_INVALID");

  return {
    id,
    status,
    signature: asNullableString(row.withdrawal_signature ?? row.signature),
    claimed: row.claimed === true,
  };
}

/** Cierra la reserva. `true` = esta llamada fue la que la cerró. */
export async function finalizeWithdrawalRow(
  userId: string,
  requestId: string,
  status: WithdrawalRowStatus,
  signature?: string | null,
  error?: string | null,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error: rpcError } = await admin.rpc(RPC_FINALIZE, {
    p_user_id: userId,
    p_request_id: requestId,
    p_status: status,
    p_signature: signature ?? null,
    p_error: error ?? null,
  });
  if (rpcError) withdrawalStoreError(rpcError);
  return data === true;
}

/** Lectura por usuario. `null` = no existe esa reserva para este usuario. */
export async function readWithdrawalRow(
  userId: string,
  requestId: string,
): Promise<StoredWithdrawalRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc(RPC_READ, {
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (error) withdrawalStoreError(error);

  const row = firstRow(data);
  if (!row) return null;
  return toStoredRecord(row);
}

/**
 * Store real que consume `lib/wallet/withdrawal-store.ts`. No guarda estado en
 * memoria: un `Map` local volvería a esconder la reserva de las demás
 * instancias y a perder la idempotencia en el próximo deploy.
 */
export function createSupabaseWithdrawalStore(): WithdrawalStore {
  return {
    reserve(input): Promise<ReserveWithdrawalResult> {
      return reserveWithdrawalRow(input);
    },
    claimSubmit(userId, requestId, signature): Promise<ClaimWithdrawalResult | null> {
      return claimWithdrawalSubmitRow(userId, requestId, signature);
    },
    finalize(userId, requestId, status, signature, error): Promise<boolean> {
      return finalizeWithdrawalRow(userId, requestId, status, signature, error);
    },
    read(userId, requestId): Promise<StoredWithdrawalRecord | null> {
      return readWithdrawalRow(userId, requestId);
    },
  };
}
