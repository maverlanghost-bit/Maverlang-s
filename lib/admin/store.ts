import "server-only";

import {
  toAdminAsset,
  type AdminAsset,
  type AssetOverrideStore,
  type AssetSnapshot,
} from "@/lib/admin/override";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ASSET_CAP = 1000;
/** M74: tope de filas por consulta del panel (beta y límites). */
const USER_LIMITS_CAP = 100;

function adminClient() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/** `undefined` = no hay fila. Lanza si la base no responde. */
export async function readFlagValue(key: string): Promise<unknown> {
  const admin = adminClient();
  if (!admin) throw new Error("flags: sin cliente");
  const { data, error } = await admin.from("app_flags").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error("flags: lectura");
  if (!data) return undefined;
  return data.value;
}

export async function readFlagMap(keys: readonly string[]): Promise<Map<string, unknown>> {
  const admin = adminClient();
  if (!admin) throw new Error("flags: sin cliente");
  const { data, error } = await admin.from("app_flags").select("key,value").in("key", [...keys]);
  if (error) throw new Error("flags: lectura");
  const map = new Map<string, unknown>();
  for (const row of data ?? []) {
    if (row && typeof row.key === "string") map.set(row.key, row.value);
  }
  return map;
}

export async function writeFlagValue(key: string, value: boolean, userId: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { error } = await admin.from("app_flags").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "key" },
  );
  return !error;
}

export async function listAdminAssets(): Promise<{ ok: boolean; truncated: boolean; assets: AdminAsset[] }> {
  const admin = adminClient();
  if (!admin) return { ok: false, truncated: false, assets: [] };
  const { data, error } = await admin
    .from("assets")
    .select("symbol,name,safety_status,safety_reasons,safety_checked_at,manual_override,manual_note")
    .order("symbol", { ascending: true })
    .limit(ASSET_CAP);
  if (error || !data) return { ok: false, truncated: false, assets: [] };
  const assets: AdminAsset[] = [];
  for (const row of data) {
    if (row && typeof row === "object") {
      const asset = toAdminAsset(row as Record<string, unknown>);
      if (asset) assets.push(asset);
    }
  }
  return { ok: true, truncated: data.length >= ASSET_CAP, assets };
}

export function createAssetOverrideStore(): AssetOverrideStore {
  return {
    async find(symbol: string): Promise<AssetSnapshot | null> {
      const admin = adminClient();
      if (!admin) return null;
      const { data, error } = await admin
        .from("assets")
        .select("symbol,safety_status")
        .eq("symbol", symbol)
        .maybeSingle();
      if (error || !data || typeof data.symbol !== "string") return null;
      return {
        symbol: data.symbol,
        safety_status: typeof data.safety_status === "string" ? data.safety_status : null,
      };
    },
    /**
     * M57-fix: último estado que dejó una corrida de auditoría para el
     * símbolo (eventos `result` PASA/NO PASA; los del panel traen
     * OCULTAR/QUITAR_OVERRIDE y quedan fuera). `null` = sin corrida previa.
     */
    async findLastAuditStatus(symbol: string): Promise<string | null> {
      const admin = adminClient();
      if (!admin) return null;
      const { data, error } = await admin
        .from("asset_safety_events")
        .select("status_after")
        .eq("symbol", symbol)
        .in("result", ["PASA", "NO PASA"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return typeof data.status_after === "string" && data.status_after.length > 0
        ? data.status_after
        : null;
    },
    async update(symbol: string, patch: Record<string, unknown>): Promise<boolean> {
      const admin = adminClient();
      if (!admin) return false;
      const { data, error } = await admin.from("assets").update(patch).eq("symbol", symbol).select("symbol");
      if (error || !Array.isArray(data)) return false;
      return data.length === 1;
    },
    async insertEvent(event: Record<string, unknown>): Promise<boolean> {
      const admin = adminClient();
      if (!admin) return false;
      const { error } = await admin.from("asset_safety_events").insert(event);
      return !error;
    },
  };
}

// ---------------------------------------------------------------------------
// M74: límites por usuario, beta y auditoría del panel
// ---------------------------------------------------------------------------

/** Fila de `user_limits` tal como viene de la base (crudo de Postgres). */
export type UserLimitsRawRow = {
  user_id: string;
  per_order_usd: number | string | null;
  daily_usd: number | string | null;
  monthly_usd: number | string | null;
  note: string | null;
  updated_at: string | null;
};

/** Fila de `beta_users` con el correo resuelto desde `auth.users`/`profiles`. */
export type BetaUserRow = {
  user_id: string;
  email: string | null;
  invited_by: string | null;
  invited_at: string | null;
  note: string | null;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toUserLimitsRow(row: Record<string, unknown>): {
  user_id: string;
  per_order_usd: number | null;
  daily_usd: number | null;
  monthly_usd: number | null;
  note: string | null;
  updated_at: string | null;
} | null {
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  if (!userId) return null;
  return {
    user_id: userId,
    per_order_usd: toNumberOrNull(row.per_order_usd),
    daily_usd: toNumberOrNull(row.daily_usd),
    monthly_usd: toNumberOrNull(row.monthly_usd),
    note: typeof row.note === "string" && row.note.trim() ? row.note : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * Lee los topes de un usuario. `null` = sin fila: usa los defaults de
 * `app_flags.limits_default`. Lanza si la base no responde.
 */
export async function readUserLimitsRow(userId: string): Promise<UserLimitsRawRow | null> {
  const admin = adminClient();
  if (!admin) throw new Error("limits: sin cliente");
  const { data, error } = await admin
    .from("user_limits")
    .select("user_id,per_order_usd,daily_usd,monthly_usd,note,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("limits: lectura");
  if (!data) return null;
  return toUserLimitsRow(data as Record<string, unknown>);
}

/** Escribe (upsert) los topes de un usuario. Devuelve false si no pudo. */
export async function writeUserLimitsRow(
  userId: string,
  patch: { per_order_usd: number | null; daily_usd: number | null; monthly_usd: number | null },
  note: string | null,
): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { error } = await admin.from("user_limits").upsert(
    {
      user_id: userId,
      per_order_usd: patch.per_order_usd,
      daily_usd: patch.daily_usd,
      monthly_usd: patch.monthly_usd,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return !error;
}

/**
 * Resuelve un usuario del panel por correo (búsqueda exacta en `auth.users`
 * vía `profiles.email`, que el trigger de 0002 mantiene sincronizado).
 */
export async function findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const admin = adminClient();
  if (!admin) throw new Error("limits: sin cliente");
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("id,email")
    .ilike("email", wanted)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id?: unknown; email?: unknown };
  if (typeof row.id !== "string" || !row.id) return null;
  return { id: row.id, email: typeof row.email === "string" ? row.email : wanted };
}

/** Lista la beta (más recientes primero) con el correo de cada usuario. */
export async function listBetaUsers(): Promise<{ ok: boolean; users: BetaUserRow[] }> {
  const admin = adminClient();
  if (!admin) return { ok: false, users: [] };
  const { data, error } = await admin
    .from("beta_users")
    .select("user_id,invited_by,invited_at,note")
    .order("invited_at", { ascending: false })
    .limit(USER_LIMITS_CAP);
  if (error || !data) return { ok: false, users: [] };
  const ids = data
    .map((row) => (row as { user_id?: unknown }).user_id)
    .filter((id): id is string => typeof id === "string");
  const emails = await emailsForUsers(ids);
  const users: BetaUserRow[] = data.map((raw) => {
    const row = raw as Record<string, unknown>;
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    return {
      user_id: userId,
      email: emails.get(userId) ?? null,
      invited_by: typeof row.invited_by === "string" ? row.invited_by : null,
      invited_at: typeof row.invited_at === "string" ? row.invited_at : null,
      note: typeof row.note === "string" && row.note.trim() ? row.note : null,
    };
  });
  return { ok: true, users };
}

async function emailsForUsers(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const admin = adminClient();
  if (!admin) return map;
  const { data, error } = await admin.from("profiles").select("id,email").in("id", ids);
  if (error || !data) return map;
  for (const row of data as Array<{ id?: unknown; email?: unknown }>) {
    if (typeof row.id === "string" && typeof row.email === "string" && row.email) {
      map.set(row.id, row.email);
    }
  }
  return map;
}

/** Agrega un usuario a la beta (idempotente). */
export async function addBetaUser(
  userId: string,
  invitedBy: string,
  note: string | null,
): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { error } = await admin
    .from("beta_users")
    .upsert(
      { user_id: userId, invited_by: invitedBy, note, invited_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return !error;
}

/** Quita a un usuario de la beta. */
export async function removeBetaUser(userId: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { error } = await admin.from("beta_users").delete().eq("user_id", userId);
  return !error;
}

/** ¿Está el usuario en la beta? Base caída = no (fail-closed). */
export async function isBetaUser(userId: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("beta_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.user_id === userId;
}

/** Evento de auditoría del panel (trazabilidad de cambios de M74). */
export async function insertAdminAuditEvent(
  userId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { error } = await admin.from("compliance_events").insert({ user_id: userId, type, data });
  return !error;
}
