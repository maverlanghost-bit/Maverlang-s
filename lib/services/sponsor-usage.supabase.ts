import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { SponsorAbuseLimits } from "@/lib/solana/sponsorship/contracts";

/**
 * Acceso a `sponsor_usage` / `sponsor_usage_requests` y a las funciones
 * atómicas de la 0048.
 *
 * Vive en `lib/services/*.supabase.ts` para que el cliente admin quede dentro
 * de la lista blanca (M57). La decisión de negar y la traducción de errores
 * viven en `lib/solana/sponsorship/usage-store.ts`; acá sólo se habla con
 * Supabase.
 *
 * Si la migración 0048 no está aplicada, la tabla/función no existe o la base
 * no responde, el error sube y el almacén devuelve rechazo. No hay fallback a
 * "sin límites". Tampoco se registra el mensaje de error de PostgREST: sólo se
 * propaga un error genérico, sin datos de la transacción.
 */

type UnknownRow = Record<string, unknown>;

export interface SponsorUsageRpcInput {
  readonly requestId: string;
  readonly userId: string;
  readonly sponsorId: string;
  readonly feeLamports: number;
  readonly messageSha256: string;
  readonly limits: SponsorAbuseLimits;
}

export interface SponsorUsageRpcResult {
  readonly allowed: boolean;
  readonly code: string | null;
  readonly remaining: number | null;
}

function firstRow(data: unknown): UnknownRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as UnknownRow) : null;
  }
  return data && typeof data === "object" ? (data as UnknownRow) : null;
}

/** PostgREST puede devolver bigint como string: se acepta sólo un entero ≥ 0. */
function asCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

export async function reserveSponsorUsage(
  input: SponsorUsageRpcInput,
): Promise<SponsorUsageRpcResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("reserve_sponsor_usage", {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_sponsor_id: input.sponsorId,
    p_fee_lamports: input.feeLamports,
    p_message_sha256: input.messageSha256,
    p_max_per_user_hour: input.limits.maxPerUserPerHour,
    p_max_per_user_day: input.limits.maxPerUserPerDay,
    p_max_per_sponsor_day: input.limits.maxPerSponsorPerDay,
    p_max_lamports_user_day: input.limits.maxLamportsPerUserPerDay,
    p_max_lamports_sponsor_day: input.limits.maxLamportsPerSponsorPerDay,
    p_cooldown_ms: input.limits.cooldownMs,
  });
  if (error) throw new Error("sponsor_usage_rpc_failed");

  const row = firstRow(data);
  if (!row) throw new Error("sponsor_usage_rpc_empty");

  // `allowed` sólo es verdadero si la base lo dijo con un booleano literal.
  // Cualquier otra cosa (null, string, número) se devuelve como rechazo y el
  // almacén la trata igual.
  const allowed = row.allowed === true;
  const code = typeof row.code === "string" && row.code.trim() !== "" ? row.code.trim() : null;
  const remaining = asCount(row.remaining);
  return { allowed, code, remaining };
}

export async function releaseSponsorUsage(input: {
  readonly requestId: string;
  readonly sponsorId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("release_sponsor_usage", {
    p_request_id: input.requestId,
    p_sponsor_id: input.sponsorId,
  });
  if (error) throw new Error("sponsor_usage_release_failed");
}
