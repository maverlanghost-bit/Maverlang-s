import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import { readSupabaseSecretKey } from "@/lib/supabase/secret";

/**
 * `ai_shared_chats` (0054 + 0058: `expires_at`, `revoked_at`, dueño con
 * ON DELETE CASCADE). Si las columnas de 0058 faltan, las lecturas devuelven
 * `null` y las escrituras lanzan: se falla cerrado, nunca "sin vencimiento".
 */

export type SharedChatRow = {
  id: string;
  title: string;
  messages: unknown;
  created_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

export type SharedChatInsertRow = {
  id: string;
  owner_id: string | null;
  title: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
};

const COLUMNS = "id, title, messages, created_at, expires_at, revoked_at";

/** Hay cliente admin de Supabase configurado (independiente de `DATA_MODE`). */
export function shareSupabaseConfigured(): boolean {
  return Boolean(readSupabasePublicConfig() && readSupabaseSecretKey());
}

export async function insertSharedChatRow(row: SharedChatInsertRow): Promise<SharedChatRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("ai_shared_chats").insert(row).select(COLUMNS).single();
  if (error || !data) {
    throw new Error(`No se pudo guardar el chat compartido: ${error?.message ?? "sin datos"}`);
  }
  return data as SharedChatRow;
}

/** Sólo filas vigentes: sin revocar y no vencidas (filtrado en SQL). */
export async function selectSharedChatRow(id: string): Promise<SharedChatRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_shared_chats")
    .select(COLUMNS)
    .eq("id", id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return data as SharedChatRow;
}

/** Enlaces vigentes del dueño. Lanza si no se puede contar (columnas ausentes). */
export async function countActiveSharedChatRows(ownerId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("ai_shared_chats")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error || count === null) {
    throw new Error(`No se pudo contar los chats compartidos: ${error?.message ?? "sin datos"}`);
  }
  return count;
}

/** Revoca sólo si `owner_id` coincide. `true` si había un enlace vigente del dueño. */
export async function revokeSharedChatRow(id: string, ownerId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_shared_chats")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(`No se pudo revocar el chat compartido: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
