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
