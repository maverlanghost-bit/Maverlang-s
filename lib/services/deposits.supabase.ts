import "server-only";

import { hasConfirmedEmail } from "@/lib/auth/email-verification";
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

/**
 * Firmas ya registradas para un usuario (evita contar dos veces).
 * No distingue "sin firmas" de "no se pudo leer": para el barrido del cron
 * usar `listDepositSignaturesForScan`, que falla cerrado.
 */
export async function listDepositSignatures(userId: string): Promise<Set<string>> {
  return (await listDepositSignaturesForScan(userId)) ?? new Set();
}

/**
 * Firmas ya registradas, con error explícito: `null` = no se pudo leer.
 * `limit` acota la lectura del cron; sin él se leen todas (comportamiento
 * histórico de `listDepositSignatures`).
 */
export async function listDepositSignaturesForScan(
  userId: string,
  limit?: number,
): Promise<Set<string> | null> {
  const admin = createSupabaseAdminClient();
  const base = admin
    .from("crypto_deposits")
    .select("signature")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const bounded = typeof limit === "number" && Number.isInteger(limit) && limit > 0
    ? base.limit(limit)
    : base;
  const { data, error } = await bounded;
  if (error || !data) return null;
  return new Set((data as { signature: string | null }[]).map((row) => row.signature).filter((s): s is string => Boolean(s)));
}

/**
 * Registra un depósito. `onConflict: signature` lo hace idempotente.
 * Devuelve `true` sólo si la fila se insertó de verdad: con
 * `ignoreDuplicates` un conflicto no es error, pero tampoco es un depósito
 * nuevo (idempotencia real, no "upsert aceptado").
 */
export async function insertCryptoDeposit(row: {
  userId: string;
  mint: string;
  amountUi: number;
  signature: string;
  fromAddress: string | null;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("crypto_deposits")
    .upsert(
      {
        user_id: row.userId,
        mint: row.mint,
        amount_ui: row.amountUi,
        signature: row.signature,
        from_address: row.fromAddress,
      },
      { onConflict: "signature", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Dueño actual de una firma (aislamiento por usuario). La firma es única
 * global en `crypto_deposits`: antes de reparar una actividad hay que
 * confirmar que la firma no quedó registrada a nombre de otro usuario.
 * `ok: false` = no se pudo leer (el llamador debe fallar cerrado).
 */
export async function findCryptoDepositOwner(
  signature: string,
): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("crypto_deposits")
    .select("user_id")
    .eq("signature", signature)
    .maybeSingle();
  if (error) return { ok: false };
  const userId = typeof (data as { user_id?: unknown } | null)?.user_id === "string"
    ? (data as { user_id: string }).user_id
    : null;
  return { ok: true, userId };
}

// ---------------------------------------------------------------------------
// Barrido de depósitos del cron (M78 → seguimiento en staging).
// Lecturas acotadas y con error explícito (`null`): una base que no se pudo
// leer nunca se interpreta como "no hay billeteras que revisar".
// ---------------------------------------------------------------------------

export interface DepositScanWallet {
  userId: string;
  address: string;
}

/**
 * Total de billeteras Solana con identidad Privy persistida (0040), para
 * rotar el lote del cron. Las filas antiguas sin DID no se escanean: no se
 * puede demostrar a qué identidad pertenecen.
 */
export async function countDepositScanWallets(): Promise<number | null> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("wallets")
    .select("user_id", { count: "exact", head: true })
    .eq("chain", "solana")
    .like("privy_user_id", "did:privy:%");
  if (error || typeof count !== "number") return null;
  return count;
}

/**
 * Página de billeteras con identidad Privy verificada a revisar. El `user_id`
 * sale SIEMPRE de `wallets` (verificado por M66 + DID persistido de 0040),
 * nunca de la cadena ni del cliente: es el aislamiento por usuario del
 * barrido. Las filas sin DID quedan fuera. `null` si la lectura falla.
 */
export async function listWalletsForDepositScan(
  limit: number,
  offset: number,
): Promise<DepositScanWallet[] | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("wallets")
    .select("user_id,address")
    .eq("chain", "solana")
    .like("privy_user_id", "did:privy:%")
    .order("user_id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error || !Array.isArray(data)) return null;
  return (data as { user_id: string; address: string }[])
    .filter((row) => typeof row.user_id === "string" && row.user_id !== "" && typeof row.address === "string")
    .map((row) => ({ userId: row.user_id, address: row.address }));
}

/**
 * Correo VERIFICADO del usuario según Supabase Auth (no `profiles.email`).
 * Es la única fuente que usan los depósitos: `null` si no se pudo leer, si no
 * hay correo o si Auth no confirma el CORREO. Fail-closed.
 *
 * La marca válida es `email_confirmed_at`: `confirmed_at` también se escribe
 * cuando la cuenta se confirma por teléfono y NO prueba el correo.
 *
 * Lee con el cliente admin (service_role) porque `auth.users` no se expone por
 * PostgREST. No registra el correo en logs.
 */
export async function readVerifiedUserEmail(
  userId: string,
): Promise<{ email: string; emailVerified: boolean } | null> {
  if (typeof userId !== "string" || userId.trim() === "") return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const raw = typeof data.user.email === "string" ? data.user.email.trim().toLowerCase() : "";
  if (raw === "") return null;
  return { email: raw, emailVerified: hasConfirmedEmail(data.user) };
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
