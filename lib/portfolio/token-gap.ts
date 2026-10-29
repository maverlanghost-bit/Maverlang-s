/**
 * Brecha entre el precio del token que muestra la app y el último cierre
 * real del subyacente. Sólo entra una serie `source: "closes"`.
 * Sin un precio válido, no hay cifra: no se toma un punto anterior ni un cero.
 */

export type GapSide = "above" | "below" | "even";

export interface TokenStockGap {
  tokenUsd: number;
  /** ISO, o null si la hora no es válida. */
  tokenAt: string | null;
  closeUsd: number;
  /** ISO del último punto, o null si el timestamp no es válido. */
  closeAt: string | null;
  /** (token − cierre) / cierre. */
  diffPct: number;
  side: GapSide;
}

const CLOSE_SOURCE = "closes";

const gapPercent = new Intl.NumberFormat("es-CL", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isoFromMs(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isoFromInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** A 2 decimales de porcentaje (4 decimales de ratio) un desvío nulo se lee como empate. */
export function gapSide(diffPct: number): GapSide {
  const rounded = Math.round(diffPct * 10_000) / 10_000;
  if (rounded > 0) return "above";
  if (rounded < 0) return "below";
  return "even";
}

/** Porcentaje absoluto, sin signo: la frase ya dice sobre o bajo. */
export function gapPercentText(ratio: number): string {
  if (!Number.isFinite(ratio)) return "";
  return gapPercent.format(Math.abs(ratio));
}

export function tokenStockGap(input: {
  tokenUsd: number | null | undefined;
  tokenAt?: string | null;
  source?: string | null;
  points?: readonly { t: number; p: number }[] | null;
}): TokenStockGap | null {
  if (input.source !== CLOSE_SOURCE) return null;
  const points = input.points;
  if (!points || points.length === 0) return null;
  const last = points[points.length - 1];
  if (!last || !Number.isFinite(last.p) || last.p <= 0) return null;
  const tokenUsd = input.tokenUsd;
  if (typeof tokenUsd !== "number" || !Number.isFinite(tokenUsd) || tokenUsd <= 0) return null;
  const diffPct = (tokenUsd - last.p) / last.p;
  if (!Number.isFinite(diffPct)) return null;
  return {
    tokenUsd,
    tokenAt: isoFromInput(input.tokenAt),
    closeUsd: last.p,
    closeAt: isoFromMs(last.t),
    diffPct,
    side: gapSide(diffPct),
  };
}
