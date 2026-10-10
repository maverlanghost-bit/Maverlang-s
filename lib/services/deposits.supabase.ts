import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Acceso a datos de depósitos de cripto (`crypto_deposits`). Vive en
 * `lib/services/*.supabase.ts` para no sacar el cliente admin de la lista
 * blanca (M57). No corre desde un componente cliente.
 */

export interface CryptoDepositRow {
  id: string;
  user_id: string;
  mint: string;
  amount_ui: number;
  signature: string | null;
  from_address: string | null;
  created_at: string;
}

/** Firmas ya registradas para un usuario (evita contar dos veces). */
export async function listDepositSignatures(userId: string): Promise<Set<string>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("crypto_deposits")
    .select("signature")
    .eq("user_id", userId);
  if (error || !data) return new Set();
  return new Set((data as { signature: string | null }[]).map((row) => row.signature).filter((s): s is string => Boolean(s)));
}

/** Registra un depósito. `onConflict: signature` lo hace idempotente. */
export async function insertCryptoDeposit(row: {
  userId: string;
  mint: string;
  amountUi: number;
  signature: string;
  fromAddress: string | null;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("crypto_deposits").upsert(
    {
      user_id: row.userId,
      mint: row.mint,
      amount_ui: row.amountUi,
      signature: row.signature,
      from_address: row.fromAddress,
    },
    { onConflict: "signature", ignoreDuplicates: true },
  );
  return !error;
}

/** Lista los depósitos de un usuario (para el historial). */
export async function listCryptoDeposits(userId: string, limit = 100): Promise<CryptoDepositRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("crypto_deposits")
    .select("id,user_id,mint,amount_ui,signature,from_address,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as CryptoDepositRow[];
}
