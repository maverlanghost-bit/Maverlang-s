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

/** Guarda una orden recién ejecutada. Devuelve el id, o null si no se pudo. */
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
  // Si la migración 0024 (request_id) no está aplicada, reintenta sin ella
  // para no perder una orden que Jupiter ya ejecutó.
  const { request_id: _omit, ...withoutRequestId } = payload;
  void _omit;
  const retry = await admin.from("orders").insert(withoutRequestId).select("id").single();
  if (retry.error || !retry.data) return null;
  return { id: retry.data.id as string };
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

/** Actualiza el estado de una orden (confirmación en cadena). */
export async function updateOrderStatus(
  id: string,
  status: "confirmed" | "failed",
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
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
  if (error || !data) return [];
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
  if (error || !data) return [];
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
  const { error } = await client
    .from("orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "submitted"]);
  return !error;
}

