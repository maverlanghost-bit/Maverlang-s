"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/guard";
import { ADMIN_AVISO, adminHref, applyOverride } from "@/lib/admin/override";
import { createAssetOverrideStore, writeFlagValue } from "@/lib/admin/store";
import { invalidateFlag, isAdminFlagKey } from "@/lib/flags";

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
  go(q, ADMIN_AVISO.listo);
}
