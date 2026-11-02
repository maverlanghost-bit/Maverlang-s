import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Acceso a datos de órdenes reales (`orders`). Vive en
 * `lib/services/*.supabase.ts` para que el cliente admin no salga de la lista
 * blanca (M57): `trade.live.ts` es lógica de negocio y usa estas funciones.
 * No corre desde un componente cliente.
 */

export interface OrderRow {
  id: string;
  user_id: string;
  side: "buy" | "sell";
  symbol: string;
  in_amount_ui: number;
  out_amount_ui: number | null;
  fee_bps: number;
  status: "pending" | "submitted" | "confirmed" | "failed" | "expired";
  signature: string | null;
  error: string | null;
  created_at: string;
}

export interface OrderInsert {
  userId: string;
  requestId: string;
  side: "buy" | "sell";
  symbol: string;
  mint: string;
  priceUsd: number;
  feeBps: number;
  status: "submitted" | "failed";
  signature: string | null;
  error: string | null;
}

/** Busca una orden viva por su `requestId` de Jupiter (idempotencia). */
export async function findOrderByRequestId(
  userId: string,
  requestId: string,
): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id,user_id,side,symbol,in_amount_ui,out_amount_ui,fee_bps,status,signature,error,created_at")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error || !data) return null;
  return data as OrderRow;
}

/** Código Postgres del error de Supabase (vacío si no viene). */
function pgErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function pgErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

/**
 * Guarda una orden recién ejecutada. Devuelve el id, o null si no se pudo.
 *
 * - Un choque con el índice único `(user_id, request_id)` devuelve la orden
 *   existente: jamás se inserta una segunda fila para el mismo request.
 * - Sólo se reintenta sin `request_id` si la columna no existe (migración
 *   0024 sin aplicar). Cualquier otro error falla cerrado.
 */
export async function insertOrder(row: OrderInsert): Promise<{ id: string } | null> {
  const admin = createSupabaseAdminClient();
  const payload = {
    user_id: row.userId,
    request_id: row.requestId,
    side: row.side,
    symbol: row.symbol,
    mint: row.mint,
    in_amount_ui: 0,
    out_amount_ui: 0,
    price_per_share_usd: row.priceUsd,
    fee_bps: row.feeBps,
    fee_usd: 0,
    status: row.status,
    signature: row.signature,
    error: row.error,
  };
  const first = await admin.from("orders").insert(payload).select("id").single();
  if (!first.error && first.data) return { id: first.data.id as string };
  if (pgErrorCode(first.error) === "23505") {
    const existing = await findOrderByRequestId(row.userId, row.requestId);
    return existing ? { id: existing.id } : null;
  }
  const code = pgErrorCode(first.error);
  const message = pgErrorMessage(first.error);
  if (code !== "42703" && !message.includes("request_id")) return null;
  // Sin la columna `request_id` no hay idempotencia posible. Se conserva la
  // vía antigua para no perder una orden que Jupiter ya ejecutó, pero el
  // camino real (`claimOrderExecution`) falla cerrado en ese caso.
  const { request_id: _omit, ...withoutRequestId } = payload;
  void _omit;
  const retry = await admin.from("orders").insert(withoutRequestId).select("id").single();
  if (retry.error || !retry.data) return null;
  return { id: retry.data.id as string };
}

/**
 * Registra la intención de ejecutar una orden ANTES de mandar la tx a
 * Jupiter. La fila queda en `pending` con el `request_id` único: dos submits
 * simultáneos no pueden ejecutar dos veces la misma operación.
 *
 * Devuelve `null` si no se pudo reclamar (sin `request_id`/columnas de la
 * migración 0031 o error de base). El llamador debe fallar cerrado y NO
 * enviar la transacción.
 */
export interface OrderExecutionClaim {
  userId: string;
  requestId: string;
  side: "buy" | "sell";
  symbol: string;
  mint: string;
  inAmountUi: number;
  outAmountUi: number;
  priceUsd: number;
  feeBps: number;
  feeUsd: number;
  quoteExpiresAt: string | null;
}

export interface ClaimedOrder {
  id: string;
  status: OrderRow["status"];
  signature: string | null;
  /** `false` = ya existía (idempotencia); no volver a ejecutar. */
  claimed: boolean;
}

export async function claimOrderExecution(row: OrderExecutionClaim): Promise<ClaimedOrder | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .insert({
      user_id: row.userId,
      request_id: row.requestId,
      side: row.side,
      symbol: row.symbol,
      mint: row.mint,
      in_amount_ui: row.inAmountUi,
      out_amount_ui: row.outAmountUi,
      price_per_share_usd: row.priceUsd,
      fee_bps: row.feeBps,
      fee_usd: row.feeUsd,
      status: "pending",
      signature: null,
      error: null,
      is_demo: false,
      tx_signature: null,
      quote_expires_at: row.quoteExpiresAt,
    })
    .select("id,status,signature")
    .single();
  if (!error && data) {
    return {
      id: data.id as string,
      status: data.status as OrderRow["status"],
      signature: (data.signature as string | null) ?? null,
      claimed: true,
    };
  }
  if (pgErrorCode(error) === "23505") {
    const existing = await findOrderByRequestId(row.userId, row.requestId);
    if (!existing) return null;
    return {
      id: existing.id,
      status: existing.status,
      signature: existing.signature,
      claimed: false,
    };
  }
  return null;
}

/**
 * Cierra el reclamo con el resultado de Jupiter. Sólo actualiza filas que
 * SIGUEN en `pending` (ninguna corrida pisa un estado final).
 */
export async function finalizeOrderExecution(
  id: string,
  outcome: { status: "submitted" | "failed"; signature: string | null; error: string | null },
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({
      status: outcome.status,
      signature: outcome.signature,
      tx_signature: outcome.signature,
      error: outcome.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

/** Lee una orden por id (para el estado/polling). */
export async function getOrderById(id: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id,user_id,side,symbol,in_amount_ui,out_amount_ui,fee_bps,status,signature,error,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as OrderRow;
}

/**
 * Lee una orden por id EXIGIENDO que sea del usuario. Es la única lectura que
 * usa el polling de una cuenta real: un id ajeno responde igual que uno
 * inexistente (`null` → NOT_FOUND), sin filtrar datos ni tocar su estado.
 */
export async function getOrderByIdForUser(id: string, userId: string): Promise<OrderRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id,user_id,side,symbol,in_amount_ui,out_amount_ui,fee_bps,status,signature,error,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as OrderRow;
}

/** Cambios opcionales de trazabilidad al cerrar una orden desde el polling. */
export interface OrderStatusPatch {
  error?: string | null;
  errorCode?: string | null;
  confirmedAt?: string | null;
  txSignature?: string | null;
}

/**
 * Actualiza el estado de una orden (confirmación en cadena). Sólo mueve
 * órdenes abiertas: una `confirmed`/`failed`/`expired` no retrocede. Devuelve
 * `false` si no había fila abierta o la escritura falló.
 */
export async function updateOrderStatus(
  id: string,
  status: "confirmed" | "failed",
  patch: OrderStatusPatch = {},
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.errorCode !== undefined) update.error_code = patch.errorCode;
  if (patch.confirmedAt !== undefined) update.confirmed_at = patch.confirmedAt;
  if (patch.txSignature !== undefined) update.tx_signature = patch.txSignature;
  const { data, error } = await admin
    .from("orders")
    .update(update)
    .eq("id", id)
    .in("status", ["pending", "submitted"])
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

/** Lista las órdenes reales de un usuario (más recientes primero) para el historial. */
export async function listOrdersForActivity(userId: string, limit = 100): Promise<OrderRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id,user_id,side,symbol,in_amount_ui,out_amount_ui,fee_bps,status,signature,error,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as OrderRow[];
}

/**
 * Órdenes de un usuario para los límites (M74). Trayecto completo del día/mes
 * local: las ventanas se cortan en `lib/trade/limits.ts` con `created_at`.
 * `price_per_share_usd` viene para valorar ventas sin `out_amount_ui`.
 */
export async function listOrdersForLimits(
  userId: string,
  limit = 200,
): Promise<
  Array<{
    side: "buy" | "sell";
    in_amount_ui: number | null;
    out_amount_ui: number | null;
    price_per_share_usd: number | null;
    status: string;
    created_at: string;
  }>
> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("side,in_amount_ui,out_amount_ui,price_per_share_usd,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  // Auditoría 2026-11: sin lectura no se inventa una lista vacía (eso abría
  // los topes). El error sube y `checkLimits` falla cerrado.
  if (error || !Array.isArray(data)) throw new Error("orders_unavailable");
  return data as Array<{
    side: "buy" | "sell";
    in_amount_ui: number | null;
    out_amount_ui: number | null;
    price_per_share_usd: number | null;
    status: string;
    created_at: string;
  }>;
}

/** Órdenes contables de TODOS los usuarios del día (tope global). */
export async function listAllOrdersForLimits(
  limit = 1000,
): Promise<
  Array<{
    side: "buy" | "sell";
    in_amount_ui: number | null;
    out_amount_ui: number | null;
    price_per_share_usd: number | null;
    status: string;
    created_at: string;
  }>
> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("side,in_amount_ui,out_amount_ui,price_per_share_usd,status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  // Tope global: misma regla fail-closed que las órdenes del usuario.
  if (error || !Array.isArray(data)) throw new Error("orders_unavailable");
  return data as Array<{
    side: "buy" | "sell";
    in_amount_ui: number | null;
    out_amount_ui: number | null;
    price_per_share_usd: number | null;
    status: string;
    created_at: string;
  }>;
}

/**
 * Cliente admin tipado para inyección en tests (M72): la conciliación de
 * órdenes pasa un falso encadenable y nunca toca la red en `vitest`.
 */
export type OrdersAdmin = ReturnType<typeof createSupabaseAdminClient>;

/** Fila abierta que revisa la conciliación (M72). */
export interface ReconcileRow {
  id: string;
  status: "pending" | "submitted" | "confirmed" | "failed" | "expired";
  tx_signature: string | null;
  quote_expires_at: string | null;
  created_at: string;
}

/** Cambios que puede hacer la conciliación (M72). */
export interface ReconcileOrderPatch {
  status: "confirmed" | "failed" | "expired";
  error_code?: string;
  error?: string;
  confirmed_at?: string;
}

/**
 * Órdenes reales abiertas para la conciliación (M72): `is_demo = false`, en
 * `pending`/`submitted` y con antigüedad mínima (`created_at <= cutoffIso`).
 * Devuelve `null` si la lectura falla (la corrida se reporta `ok: false`,
 * nunca inventa estados sobre una base que no se pudo leer).
 */
export async function listOpenRealOrders(opts: {
  cutoffIso: string;
  limit?: number;
  admin?: OrdersAdmin;
}): Promise<ReconcileRow[] | null> {
  const client = opts.admin ?? createSupabaseAdminClient();
  const { data, error } = await client
    .from("orders")
    .select("id,status,tx_signature,quote_expires_at,created_at")
    .eq("is_demo", false)
    .in("status", ["pending", "submitted"])
    .lte("created_at", opts.cutoffIso)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 200);
  if (error || !Array.isArray(data)) return null;
  return data as ReconcileRow[];
}

/**
 * Aplica el resultado de la conciliación (M72). El update exige que la orden
 * SIGA abierta (`status in pending, submitted`): dos corridas concurrentes
 * jamás retroceden una `confirmed`/`failed` (idempotencia a nivel fila).
 * Devuelve `false` si el update no se pudo aplicar.
 */
export async function updateOrderReconciled(
  id: string,
  patch: ReconcileOrderPatch,
  admin?: OrdersAdmin,
): Promise<boolean> {
  const client = admin ?? createSupabaseAdminClient();
  // `select` distingue "actualicé una fila" de "la guardó otra corrida": sin
  // filas devueltas no se cuenta como aplicada (resumen honesto del cron).
  const { data, error } = await client
    .from("orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "submitted"])
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

