import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  ACTIVE_ALERT_CAP,
  ACTIVE_ALERT_CAP_MESSAGE,
  canCreateActiveAlert,
  isAlertId,
  normalizeAlertPrice,
  normalizeAlertSymbol,
  type AlertDirection,
  type PriceAlert,
} from "@/lib/services/alerts-logic";
import { isMissingSchemaError } from "@/lib/supabase/schema-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** La tabla no está, o no hay cliente de Supabase. El llamador degrada. */
export class AlertStoreUnavailable extends Error {
  constructor() {
    super("price_alerts unavailable");
    this.name = "AlertStoreUnavailable";
  }
}

export type CronAlert = PriceAlert & { userId: string };

export type AlertRecipient = { email: string; language: "es-CL" | "en" };

const COLUMNS = "id,user_id,symbol,direction,price_usd,active,triggered_at,created_at";

type DbLike = {
  code?: string;
  message?: string;
};

function throwDb(error: DbLike): never {
  if (isMissingSchemaError(error)) throw new AlertStoreUnavailable();
  const message = (error.message ?? "").toLowerCase();
  if (error.code === "42501" || message.includes("row-level security")) {
    throw new DomainError("UNAUTHORIZED");
  }
  throw new DomainError("UPSTREAM");
}

function adminOrUnavailable() {
  try {
    return createSupabaseAdminClient();
  } catch {
    throw new AlertStoreUnavailable();
  }
}

async function userClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AlertStoreUnavailable();
  return supabase;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rowToAlert(value: unknown, userId: string | null): (PriceAlert & { userId: string }) | null {
  const record = asRecord(value);
  if (!record) return null;
  const owner = typeof record.user_id === "string" ? record.user_id : "";
  if (!owner) return null;
  if (userId != null && owner !== userId) return null;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!isAlertId(id)) return null;
  const symbol = normalizeAlertSymbol(record.symbol);
  const direction = record.direction === "above" || record.direction === "below" ? record.direction : null;
  const rawPrice = typeof record.price_usd === "number" || typeof record.price_usd === "string" ? Number(record.price_usd) : NaN;
  const priceUsd = normalizeAlertPrice(rawPrice);
  const createdAt = typeof record.created_at === "string" ? record.created_at : "";
  if (!symbol || !direction || priceUsd == null || !createdAt) return null;
  if (record.triggered_at != null && typeof record.triggered_at !== "string") return null;
  return {
    id,
    userId: owner,
    symbol,
    direction,
    priceUsd,
    active: record.active !== false,
    triggeredAt: typeof record.triggered_at === "string" ? record.triggered_at : null,
    createdAt,
  };
}

function toPublic(row: PriceAlert & { userId: string }): PriceAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    priceUsd: row.priceUsd,
    active: row.active,
    triggeredAt: row.triggeredAt,
    createdAt: row.createdAt,
  };
}

export async function dbListAlerts(userId: string): Promise<PriceAlert[]> {
  const supabase = await userClient();
  const { data, error } = await supabase
    .from("price_alerts")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throwDb(error);
  const alerts: PriceAlert[] = [];
  for (const row of (data ?? []) as unknown[]) {
    const parsed = rowToAlert(row, userId);
    if (parsed) alerts.push(toPublic(parsed));
  }
  return alerts;
}

async function dbActiveCount(userId: string): Promise<number> {
  const supabase = await userClient();
  const { count, error } = await supabase
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("active", true)
    .is("triggered_at", null);
  if (error) throwDb(error);
  return count ?? 0;
}

export async function dbCreateAlert(
  userId: string,
  input: { symbol: string; direction: AlertDirection; priceUsd: number },
): Promise<PriceAlert> {
  const symbol = normalizeAlertSymbol(input.symbol);
  const priceUsd = normalizeAlertPrice(input.priceUsd);
  if (!symbol || priceUsd == null) throw new DomainError("VALIDATION", "El precio tiene que ser mayor que cero.");
  const before = await dbActiveCount(userId);
  if (!canCreateActiveAlert(before)) throw new DomainError("VALIDATION", ACTIVE_ALERT_CAP_MESSAGE);
  const supabase = await userClient();
  const inserted = await supabase
    .from("price_alerts")
    .insert({ user_id: userId, symbol, direction: input.direction, price_usd: priceUsd, active: true })
    .select(COLUMNS)
    .single();
  if (inserted.error) throwDb(inserted.error);
  const alert = rowToAlert(inserted.data, userId);
  if (!alert) throw new DomainError("UPSTREAM");
  const after = await dbActiveCount(userId);
  if (after > ACTIVE_ALERT_CAP) {
    await supabase.from("price_alerts").delete().eq("id", alert.id).eq("user_id", userId);
    throw new DomainError("VALIDATION", ACTIVE_ALERT_CAP_MESSAGE);
  }
  return toPublic(alert);
}

export async function dbDeleteAlert(userId: string, id: string): Promise<PriceAlert> {
  if (!isAlertId(id)) throw new DomainError("VALIDATION");
  const supabase = await userClient();
  const removed = await supabase.from("price_alerts").delete().eq("id", id).eq("user_id", userId).select(COLUMNS);
  if (removed.error) throwDb(removed.error);
  const rows = (removed.data ?? []) as unknown[];
  const alert = rows.length > 0 ? rowToAlert(rows[0], userId) : null;
  if (!alert) throw new DomainError("NOT_FOUND");
  return toPublic(alert);
}

export async function dbListOpenAlerts(): Promise<CronAlert[]> {
  const admin = adminOrUnavailable();
  const { data, error } = await admin
    .from("price_alerts")
    .select(COLUMNS)
    .eq("active", true)
    .is("triggered_at", null)
    .limit(2000);
  if (error) throwDb(error);
  const alerts: CronAlert[] = [];
  for (const row of (data ?? []) as unknown[]) {
    const parsed = rowToAlert(row, null);
    if (!parsed || !parsed.active || parsed.triggeredAt != null) continue;
    alerts.push(parsed);
  }
  return alerts;
}

/** true si esta corrida marcó la fila (otra corrida no la pisa). */
export async function dbMarkTriggered(id: string, at: string): Promise<boolean> {
  if (!isAlertId(id)) return false;
  const admin = adminOrUnavailable();
  const updated = await admin
    .from("price_alerts")
    .update({ triggered_at: at, active: false })
    .eq("id", id)
    .eq("active", true)
    .is("triggered_at", null)
    .select("id");
  if (updated.error) throwDb(updated.error);
  return Array.isArray(updated.data) && updated.data.length > 0;
}

export async function dbAlertRecipients(userIds: readonly string[]): Promise<Map<string, AlertRecipient>> {
  const out = new Map<string, AlertRecipient>();
  const unique = [...new Set(userIds.filter((id) => id.trim().length > 0))];
  if (unique.length === 0) return out;
  const admin = adminOrUnavailable();
  for (let index = 0; index < unique.length; index += 100) {
    const slice = unique.slice(index, index + 100);
    const { data, error } = await admin.from("profiles").select("id,email,language").in("id", slice);
    if (error) {
      if (isMissingSchemaError(error)) return out;
      throwDb(error);
    }
    for (const row of (data ?? []) as unknown[]) {
      const record = asRecord(row);
      if (!record || typeof record.id !== "string") continue;
      const email = typeof record.email === "string" ? record.email.trim() : "";
      if (!email.includes("@")) continue;
      out.set(record.id, { email, language: record.language === "en" ? "en" : "es-CL" });
    }
  }
  return out;
}
