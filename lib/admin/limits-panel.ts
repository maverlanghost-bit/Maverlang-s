/** Lógica pura del panel de límites y beta (M74). Sin red ni secret key. */

import { ADMIN_AVISO, type AdminAviso } from "@/lib/admin/override";

export const ADMIN_LIMITS_AVISO = {
  ...ADMIN_AVISO,
  faltaEmail: "falta-email",
  noUser: "sin-usuario",
} as const;

export type AdminLimitsAviso = AdminAviso | "falta-email" | "sin-usuario";

export const AVISO_LIMITS_TEXT: Record<AdminLimitsAviso, string> = {
  listo: "Listo. El cambio quedó guardado.",
  "falta-nota": "La nota es obligatoria.",
  confirma: "Confirma el cambio.",
  "no-se-pudo": "No se pudo guardar. Inténtalo de nuevo.",
  "falta-email": "Escribe el correo del usuario.",
  "sin-usuario": "No encontramos una cuenta con ese correo.",
};

/** Topes visibles en el panel. `null` = usa el default (se muestra "—"). */
export type LimitsFormValues = {
  perOrderUsd: number | null;
  dailyUsd: number | null;
  monthlyUsd: number | null;
  note: string | null;
};

export const LIMITS_FIELD_MAX = 1_000_000;

/**
 * Lee un campo del formulario: vacío = null (usa el default); número
 * positivo con decimales; basura o ≤ 0 = invalid (no se guarda a ciegas).
 */
export function parseLimitField(raw: FormDataEntryValue | null): number | null | "invalid" {
  if (raw === null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "invalid";
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return "invalid";
  if (value > LIMITS_FIELD_MAX) return "invalid";
  return value;
}

/** Parsea el formulario de límites. `null` = algún campo inválido. */
export function parseLimitsForm(
  formData: FormData,
): { ok: true; values: LimitsFormValues } | { ok: false } {
  const perOrder = parseLimitField(formData.get("perOrderUsd"));
  const daily = parseLimitField(formData.get("dailyUsd"));
  const monthly = parseLimitField(formData.get("monthlyUsd"));
  if (perOrder === "invalid" || daily === "invalid" || monthly === "invalid") {
    return { ok: false };
  }
  const noteRaw = String(formData.get("note") ?? "").trim();
  return {
    ok: true,
    values: {
      perOrderUsd: perOrder,
      dailyUsd: daily,
      monthlyUsd: monthly,
      note: noteRaw ? noteRaw.slice(0, 500) : null,
    },
  };
}

export function parseEmail(raw: FormDataEntryValue | null): string | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 254) return null;
  return text;
}

/** Fila de la tabla de beta lista para pintar. */
export type BetaRowView = {
  userId: string;
  email: string;
  invitedAt: string;
  note: string;
};

export function betaRowView(row: {
  user_id: string;
  email: string | null;
  invited_at: string | null;
  note: string | null;
}): BetaRowView {
  return {
    userId: row.user_id,
    email: row.email ?? row.user_id,
    invitedAt: row.invited_at ?? "—",
    note: row.note ?? "",
  };
}

/** Etiqueta del valor de un tope en el panel ("—" = default). */
export function limitFieldValue(value: number | string | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Volumen contable del día formateado (US$). */
export function formatVolumeUsd(value: number): string {
  return `US$${new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
  }).format(Math.max(0, value))}`;
}
