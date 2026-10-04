export type MoneyCurrency = "CLP" | "USD";

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
