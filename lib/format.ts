import type { Currency } from "@/lib/types";

export type MoneyCurrency = Currency;

export const clpFormat = {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
} as const satisfies Intl.NumberFormatOptions;

export const usdFormat = {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const satisfies Intl.NumberFormatOptions;

const percentFormat = {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
} as const satisfies Intl.NumberFormatOptions;

const sharesFormat = {
  maximumFractionDigits: 6,
} as const satisfies Intl.NumberFormatOptions;

const clpFormatter = new Intl.NumberFormat("es-CL", clpFormat);
const usdFormatter = new Intl.NumberFormat("es-CL", usdFormat);
const percentFormatter = new Intl.NumberFormat("es-CL", percentFormat);
const sharesFormatter = new Intl.NumberFormat("es-CL", sharesFormat);

export function moneyFormat(currency: MoneyCurrency) {
  return currency === "CLP" ? clpFormat : usdFormat;
}

export function formatMoney(value: number, currency: MoneyCurrency): string {
  return currency === "CLP" ? clpFormatter.format(value) : usdFormatter.format(value);
}

export function formatClp(value: number): string {
  return clpFormatter.format(value);
}

export function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

/** `value` es un ratio: 0.0123 → +1,23 %. */
export function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

/** Hasta 6 decimales, con sufijo de unidad. */
export function formatShares(value: number): string {
  return `${sharesFormatter.format(value)} acc.`;
}

const portionFormatter = new Intl.NumberFormat("es-CL", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Parte de un total, sin signo: 0.307 → 30,7 %. */
export function formatPortion(value: number): string {
  return portionFormatter.format(value);
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

/** Fecha y hora en Chile. El ISO de entrada se muestra igual en servidor y cliente. */
export function formatDateTime(input: string): string {
  const time = Date.parse(input);
  if (Number.isNaN(time)) return "fecha desconocida";
  return dateTimeFormatter.format(time);
}

const multiplierFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 6 });

/** Multiplicador vigente del emisor. No es una cantidad de tokens. */
export function formatMultiplier(value: number): string {
  return multiplierFormatter.format(value);
}

const relativeFormatter = new Intl.RelativeTimeFormat("es-CL", { numeric: "auto" });

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * Fecha relativa en español de Chile. Pasado: "hace 3 horas". Futuro: "dentro de 2 días".
 * `input` es un ISO, unix ms o Date.
 */
export function formatRelative(input: string | number | Date, now = Date.now()): string {
  const time = input instanceof Date ? input.getTime() : typeof input === "number" ? input : Date.parse(input);
  if (Number.isNaN(time)) return "fecha desconocida";

  const diffSec = Math.round((time - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return relativeFormatter.format(diffSec, "second");

  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (abs >= seconds) return relativeFormatter.format(Math.round(diffSec / seconds), unit);
  }

  return relativeFormatter.format(0, "second");
}
