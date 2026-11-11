import "server-only";

import { TRIAL_DAYS_MS, isBillingPlanId, type BillingPlanId } from "@/lib/billing/plans";
import type { BillingStatus } from "@/lib/billing/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Persistencia del cobro (`supabase/migrations/0053_copy_trading.sql`, S10).
 *
 * Tablas:
 * - `copy_subscriptions`: una fila por usuario (`user_id` único). La escribe
 *   SÓLO el servidor (checkout y webhook); el usuario la lee por RLS.
 * - `billing_events`: idempotencia de webhooks por `provider_event_id` único.
 *   Nunca guarda datos de tarjeta: sólo tipo, hash del cuerpo y fechas.
 *
 * Si la migración todavía no está aplicada, las lecturas devuelven `null`
 * (sin acceso, sin romper la página) y el webhook responde 200 sin activar
 * nada en vez de entrar en un bucle de reintentos.
 */

const SUBSCRIPTIONS_TABLE = "copy_subscriptions";
const EVENTS_TABLE = "billing_events";

const SUBSCRIPTION_COLUMNS = [
  "user_id",
  "plan",
  "status",
  "provider",
  "provider_customer_id",
  "provider_subscription_id",
  "trial_ends_at",
  "current_period_end",
  "cancel_at",
  "created_at",
  "updated_at",
].join(", ");

export interface BillingSubscriptionRow {
  userId: string;
  plan: BillingPlanId | null;
  status: BillingStatus;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const BILLING_STATUSES: readonly BillingStatus[] = [
  "pending",
  "trial",
  "active",
  "past_due",
  "canceled",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readStatus(value: unknown): BillingStatus {
  const text = readString(value);
  return (BILLING_STATUSES as readonly string[]).includes(text ?? "")
    ? (text as BillingStatus)
    : "pending";
}

function toSubscriptionRow(value: unknown, fallbackUserId: string): BillingSubscriptionRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const plan = readString(row.plan);
  return {
    userId: readString(row.user_id) ?? fallbackUserId,
    plan: isBillingPlanId(plan) ? plan : null,
    status: readStatus(row.status),
    provider: readString(row.provider),
    providerCustomerId: readString(row.provider_customer_id),
    providerSubscriptionId: readString(row.provider_subscription_id),
    trialEndsAt: readString(row.trial_ends_at),
    currentPeriodEnd: readString(row.current_period_end),
    cancelAt: readString(row.cancel_at),
    createdAt: readString(row.created_at),
    updatedAt: readString(row.updated_at),
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = asRecord(error);
  return readString(record?.message) ?? "error desconocido";
}

/**
 * Fila de suscripción del usuario. `null` = no tiene o no se pudo leer: en
 * ambos casos el paywall (S3) niega el acceso, así que falla cerrado.
 */
export async function getBillingSubscription(
  userId: string,
): Promise<BillingSubscriptionRow | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from(SUBSCRIPTIONS_TABLE)
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error(`billing: no se pudo leer ${SUBSCRIPTIONS_TABLE}: ${errorText(error)}`);
      return null;
    }
    return toSubscriptionRow(data, userId);
  } catch (error) {
    console.error(`billing: no se pudo leer ${SUBSCRIPTIONS_TABLE}: ${errorText(error)}`);
    return null;
  }
}

/**
 * `true` si el usuario ya gastó su prueba de 7 días. La marca es
 * `trial_ends_at`: se escribe UNA vez y no se borra (aunque la suscripción
 * se cancele y vuelva a empezar).
 */
export async function trialAlreadyUsed(userId: string): Promise<boolean> {
  const row = await getBillingSubscription(userId);
  return Boolean(row?.trialEndsAt);
}

/**
 * Deja la suscripción en `pending` con el preapproval recién creado.
 * `trial_ends_at` se fija acá (una sola vez por usuario) aunque el usuario
 * nunca autorice: la prueba se considera consumida al iniciar el checkout,
 * para que nadie acumule pruebas abandonando el pago.
 */
export async function beginSubscription(input: {
  userId: string;
  plan: BillingPlanId;
  provider: string;
  providerSubscriptionId: string;
  trialDays: number;
}): Promise<{ trialEndsAt: string | null }> {
  const existing = await getBillingSubscription(input.userId);
  const now = Date.now();
  const trialEndsAt =
    existing?.trialEndsAt ??
    (input.trialDays > 0 ? new Date(now + TRIAL_DAYS_MS).toISOString() : null);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from(SUBSCRIPTIONS_TABLE).upsert(
    {
      user_id: input.userId,
      plan: input.plan,
      status: "pending",
      provider: input.provider,
      provider_subscription_id: input.providerSubscriptionId,
      trial_ends_at: trialEndsAt,
      current_period_end: existing?.currentPeriodEnd ?? trialEndsAt,
      cancel_at: null,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error(`billing: no se pudo guardar el checkout: ${errorText(error)}`);
    throw error;
  }
  return { trialEndsAt };
}

/**
 * Aplica el estado re-consultado a la API (webhook) o la cancelación local.
 * No inventa fechas: si el proveedor no informa el próximo cobro, conserva
 * el que ya estaba.
 */
export async function saveSubscriptionState(input: {
  userId: string;
  status: BillingStatus;
  provider: string;
  providerSubscriptionId: string | null;
  plan?: BillingPlanId | null;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
}): Promise<void> {
  const existing = await getBillingSubscription(input.userId);
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    status: input.status,
    provider: input.provider,
    updated_at: now,
  };
  if (input.providerSubscriptionId) {
    payload.provider_subscription_id = input.providerSubscriptionId;
  }
  const plan = input.plan ?? existing?.plan ?? null;
  if (plan) payload.plan = plan;
  const currentPeriodEnd = input.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null;
  if (currentPeriodEnd) payload.current_period_end = currentPeriodEnd;
  if (input.cancelAt !== undefined) payload.cancel_at = input.cancelAt;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from(SUBSCRIPTIONS_TABLE)
    .upsert(payload, { onConflict: "user_id" });
  if (error) {
    console.error(`billing: no se pudo actualizar la suscripción: ${errorText(error)}`);
    throw error;
  }
}

export interface BillingEventRecord {
  duplicate: boolean;
  id: string | null;
  /** La tabla no existe o la base falló: no se puede garantizar idempotencia. */
  failed: boolean;
}

/**
 * Registra un aviso por `provider_event_id`. `duplicate: true` = ya estaba
 * (el webhook responde 200 rápido sin volver a procesar).
 */
export async function recordBillingEvent(input: {
  provider: string;
  eventId: string;
  type: string;
  payloadHash: string;
}): Promise<BillingEventRecord> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from(EVENTS_TABLE)
      .insert({
        provider: input.provider,
        provider_event_id: input.eventId,
        type: input.type,
        payload_hash: input.payloadHash,
        received_at: new Date().toISOString(),
      })
      .select("id");
    if (error) {
      // 23505 = unique_violation sobre `provider_event_id`.
      if ((error as { code?: unknown }).code === "23505") {
        return { duplicate: true, id: null, failed: false };
      }
      console.error(`billing: no se pudo registrar el evento: ${errorText(error)}`);
      return { duplicate: false, id: null, failed: true };
    }
    const first = Array.isArray(data) ? asRecord(data[0]) : null;
    return { duplicate: false, id: readString(first?.id), failed: false };
  } catch (error) {
    console.error(`billing: no se pudo registrar el evento: ${errorText(error)}`);
    return { duplicate: false, id: null, failed: true };
  }
}

/** Marca el aviso como procesado. Un fallo acá no cambia la respuesta al proveedor. */
export async function markBillingEventProcessed(id: string | null): Promise<void> {
  if (!id) return;
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from(EVENTS_TABLE)
      .update({ processed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error(`billing: no se pudo marcar el evento: ${errorText(error)}`);
    }
  } catch (error) {
    console.error(`billing: no se pudo marcar el evento: ${errorText(error)}`);
  }
}
