"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/guard";
import {
  ADMIN_LIMITS_AVISO,
  parseEmail,
  parseLimitsForm,
} from "@/lib/admin/limits-panel";
import { ADMIN_AVISO, adminHref, applyOverride } from "@/lib/admin/override";
import {
  addBetaUser,
  createAssetOverrideStore,
  findUserByEmail,
  insertAdminAuditEvent,
  removeBetaUser,
  writeFlagValue,
  writeUserLimitsRow,
} from "@/lib/admin/store";
import { invalidateFlag, isAdminFlagKey } from "@/lib/flags";
import { invalidateKillSwitchCache } from "@/lib/trade/limits";

function go(q: string, aviso: string): never {
  redirect(adminHref(q, aviso));
}

export async function hideAsset(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const q = String(formData.get("q") ?? "");
  const result = await applyOverride(createAssetOverrideStore(), {
    symbol: formData.get("symbol"),
    note: formData.get("note"),
    action: "force_hide",
    userId,
    nowIso: new Date().toISOString(),
  });
  if (result === "ok") go(q, ADMIN_AVISO.listo);
  if (result === "nota") go(q, ADMIN_AVISO.faltaNota);
  go(q, ADMIN_AVISO.noSePudo);
}

export async function clearOverride(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const q = String(formData.get("q") ?? "");
  const result = await applyOverride(createAssetOverrideStore(), {
    symbol: formData.get("symbol"),
    note: formData.get("note"),
    action: "clear_override",
    userId,
    nowIso: new Date().toISOString(),
  });
  if (result === "ok") go(q, ADMIN_AVISO.listo);
  if (result === "nota") go(q, ADMIN_AVISO.faltaNota);
  go(q, ADMIN_AVISO.noSePudo);
}

export async function setFlag(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const q = String(formData.get("q") ?? "");
  if (String(formData.get("confirm") ?? "") !== "si") go(q, ADMIN_AVISO.confirma);
  const key = String(formData.get("key") ?? "");
  if (!isAdminFlagKey(key)) go(q, ADMIN_AVISO.noSePudo);
  const raw = String(formData.get("value") ?? "");
  if (raw !== "true" && raw !== "false") go(q, ADMIN_AVISO.noSePudo);
  const saved = await writeFlagValue(key, raw === "true", userId);
  if (!saved) go(q, ADMIN_AVISO.noSePudo);
  invalidateFlag(key);
  // M74: los kill switches viven en el cache local del trade; al cambiar
  // un flag desde el panel se limpia para que el corte sea inmediato acá.
  invalidateKillSwitchCache();
  await insertAdminAuditEvent(userId, "admin_flag_change", {
    key,
    value: raw === "true",
    at: new Date().toISOString(),
  }).catch(() => false);
  go(q, ADMIN_AVISO.listo);
}

// ---------------------------------------------------------------------------
// M74: límites por usuario y beta
// ---------------------------------------------------------------------------

/** Guarda los topes de un usuario buscado por correo. */
export async function setUserLimits(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const q = String(formData.get("q") ?? "");
  const email = parseEmail(formData.get("email"));
  if (!email) go(q, ADMIN_LIMITS_AVISO.faltaEmail);
  const parsed = parseLimitsForm(formData);
  if (!parsed.ok) go(q, ADMIN_AVISO.noSePudo);
  const user = await findUserByEmail(email).catch(() => null);
  if (!user) go(q, ADMIN_LIMITS_AVISO.noUser);
  const saved = await writeUserLimitsRow(user.id, {
    per_order_usd: parsed.values.perOrderUsd,
    daily_usd: parsed.values.dailyUsd,
    monthly_usd: parsed.values.monthlyUsd,
  }, parsed.values.note);
  if (!saved) go(q, ADMIN_AVISO.noSePudo);
  await insertAdminAuditEvent(userId, "admin_user_limits", {
    target: user.id,
    email,
    ...parsed.values,
    at: new Date().toISOString(),
  }).catch(() => false);
  go(q, ADMIN_AVISO.listo);
}

/** Agrega a la beta por correo (idempotente). */
export async function addBetaMember(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const q = String(formData.get("q") ?? "");
  const email = parseEmail(formData.get("email"));
  if (!email) go(q, ADMIN_LIMITS_AVISO.faltaEmail);
  const user = await findUserByEmail(email).catch(() => null);
  if (!user) go(q, ADMIN_LIMITS_AVISO.noUser);
  const noteRaw = String(formData.get("note") ?? "").trim();
  const saved = await addBetaUser(user.id, userId, noteRaw ? noteRaw.slice(0, 500) : null);
  if (!saved) go(q, ADMIN_AVISO.noSePudo);
  await insertAdminAuditEvent(userId, "admin_beta_add", {
    target: user.id,
    email,
    at: new Date().toISOString(),
  }).catch(() => false);
  go(q, ADMIN_AVISO.listo);
}

/** Quita de la beta por `user_id`. */
export async function removeBetaMember(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const q = String(formData.get("q") ?? "");
  const target = String(formData.get("userId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(target)) go(q, ADMIN_AVISO.noSePudo);
  const saved = await removeBetaUser(target);
  if (!saved) go(q, ADMIN_AVISO.noSePudo);
  await insertAdminAuditEvent(userId, "admin_beta_remove", {
    target,
    at: new Date().toISOString(),
  }).catch(() => false);
  go(q, ADMIN_AVISO.listo);
}
