import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SharedChatRow = {
  id: string;
  title: string;
  messages: unknown;
  created_at: string;
};

export type SharedChatInsertRow = {
  id: string;
  owner_id: string | null;
  title: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
};

export async function insertSharedChatRow(row: SharedChatInsertRow): Promise<SharedChatRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_shared_chats")
    .insert(row)
    .select("id, title, messages, created_at")
    .single();
  if (error || !data) {
    throw new Error(`No se pudo guardar el chat compartido: ${error?.message ?? "sin datos"}`);
  }
  return data as SharedChatRow;
}

export async function selectSharedChatRow(id: string): Promise<SharedChatRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_shared_chats")
    .select("id, title, messages, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as SharedChatRow;
}
