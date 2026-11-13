/**
 * Chips y fechas de atraso de «Copiar carteras».
 *
 * Un 13F puede presentarse hasta 45 días después del cierre del trimestre: el
 * atraso es parte del dato, no un error. Los umbrales son por familia y sólo
 * describen la edad del dato; nunca prometen rendimiento.
 *
 * Módulo sin `server-only`: lo usan también componentes de cliente.
 */

import type { CopyFamily } from "./types";

export type LagTone = "neutral" | "amber" | "red";

export type LagChip = {
  tone: LagTone;
  label: string;
};

type LagThreshold = {
  /** Hasta acá el atraso es lo normal de la familia. */
  normal: number;
  /** Sobre esto el dato está claramente desactualizado. */
  late: number;
};

const THRESHOLDS: Record<CopyFamily, LagThreshold> = {
  // 13F: hasta 45 días es el plazo legal de presentación.
  "13f": { normal: 45, late: 120 },
  // Holdings diarios del emisor.
  etf: { normal: 3, late: 10 },
  // PDF semanal o mensual de la corredora.
  broker_cl: { normal: 10, late: 31 },
  // AFP: informes periódicos, no diarios.
  afp: { normal: 31, late: 60 },
  // Canastas editoriales.
  thematic: { normal: 7, late: 21 },
};

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDateParts(iso: string | null | undefined): { year: number; month: number; day: number } | null {
  if (typeof iso !== "string") return null;
  const match = DATE_PREFIX.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utc)) return null;
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function startOfUtcDay(iso: string): number | null {
  const parts = parseDateParts(iso);
  if (!parts) return null;
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/** «30 sep 2026». Cadena vacía si la fecha falta o no es válida. */
export function formatFeedDate(iso: string | null | undefined): string {
  const parts = parseDateParts(iso);
  if (!parts) return "";
  const month = MONTHS_ES[parts.month - 1];
  if (!month) return "";
  return `${parts.day} ${month} ${parts.year}`;
}

/** Días completos desde `iso` hasta `now` (UTC). `null` si la fecha no sirve. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (typeof iso !== "string") return null;
  const start = startOfUtcDay(iso);
  if (start === null) return null;
  const today = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  return Math.round((today - start) / 86_400_000);
}

function pluralDias(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

/**
 * Chip de atraso. `isFrozen` gana sobre la edad: una cartera congelada no va a
 * actualizarse, así que no se pinta como «desactualizada».
 */
export function lagChip(
  asOf: string,
  family: CopyFamily,
  isFrozen: boolean,
  now: number = Date.now(),
): LagChip {
  if (isFrozen) return { tone: "neutral", label: "Cartera congelada · sin datos nuevos" };

  const days = daysSince(asOf, now);
  if (days === null) return { tone: "neutral", label: "Sin fecha de dato" };

  const date = formatFeedDate(asOf);
  const threshold = THRESHOLDS[family];

  if (days <= 0) {
    return { tone: "neutral", label: date ? `Dato al ${date}` : "Dato de hoy" };
  }
  if (days <= threshold.normal) {
    return { tone: "neutral", label: `Dato al ${date} · ${pluralDias(days)}` };
  }
  if (days <= threshold.late) {
    return { tone: "amber", label: `Atraso de ${pluralDias(days)} · dato al ${date}` };
  }
  return { tone: "red", label: `Desactualizado: ${pluralDias(days)} · dato al ${date}` };
}
