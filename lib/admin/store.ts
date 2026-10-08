import "server-only";

import {
  toAdminAsset,
  type AdminAsset,
  type AssetOverrideStore,
  type AssetSnapshot,
} from "@/lib/admin/override";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ASSET_CAP = 1000;

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
