import { DomainError } from "@/lib/api/result";
import { hashSeed, mulberry32 } from "@/lib/mocks/prng";
import { roundDigits } from "@/lib/mocks/number";
import type { PricePoint, Quote, Range } from "@/lib/types";

/**
 * Anclas de precio para el demo. No son cotizaciones.
 * Todas las Quote que salen de aquí llevan source: "mock".
 * Multiplicador 1 hasta que el live lea scaled UI del mint (T18).
 * HOODx y MSTRx están apagados en el allowlist; la ancla sólo sirve si se pide el símbolo.
 */
const ANCHORS: Record<string, { priceUsd: number; multiplier: number }> = {
  AAPLx: { priceUsd: 228.4, multiplier: 1 },
  NVDAx: { priceUsd: 131.15, multiplier: 1 },
  TSLAx: { priceUsd: 248.9, multiplier: 1 },
  SPYx: { priceUsd: 572.3, multiplier: 1 },
  QQQx: { priceUsd: 495.6, multiplier: 1 },
  GOOGLx: { priceUsd: 172.8, multiplier: 1 },
  MSFTx: { priceUsd: 428.1, multiplier: 1 },
  AMZNx: { priceUsd: 198.45, multiplier: 1 },
  METAx: { priceUsd: 582.2, multiplier: 1 },
  CRCLx: { priceUsd: 148, multiplier: 1 },
  HOODx: { priceUsd: 40, multiplier: 1 },
  MSTRx: { priceUsd: 330, multiplier: 1 },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_SPEC: Record<Range, { points: number; stepMs: number }> = {
  "1W": { points: 24 * 7, stepMs: 60 * 60 * 1000 },
  "1M": { points: 30 * 4, stepMs: 6 * 60 * 60 * 1000 },
  "3M": { points: 90, stepMs: DAY_MS },
  "1Y": { points: 365, stepMs: DAY_MS },
  ALL: { points: 365 * 3, stepMs: DAY_MS },
};

function anchorOf(symbol: string): { symbol: string; priceUsd: number; multiplier: number } {
  const row = ANCHORS[symbol];
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
  return { symbol, ...row };
}

/** Random walk con semilla por símbolo y rango. El último punto es el precio ancla. */
export function priceHistory(symbol: string, range: Range, now = Date.now()): PricePoint[] {
  const anchor = anchorOf(symbol);
  const spec = RANGE_SPEC[range];
  const rand = mulberry32(hashSeed(`${symbol}:${range}`));
  const stepScale = Math.sqrt(spec.stepMs / DAY_MS);
  const values = [1];
  for (let index = 1; index < spec.points; index += 1) {
    const previous = values[index - 1] ?? 1;
    const shock = (rand() - 0.5) * 0.024 * stepScale;
    values.push(previous * (1 + shock));
  }
  const last = values[values.length - 1] ?? 1;
  const scale = last === 0 ? 1 : anchor.priceUsd / last;
  const end = now - (now % spec.stepMs);
  return values.map((value, index) => ({
    t: end - (spec.points - 1 - index) * spec.stepMs,
    p: index === values.length - 1 ? anchor.priceUsd : roundDigits(value * scale, 4),
  }));
}

export function quoteFor(symbol: string, now = Date.now()): Quote {
  const anchor = anchorOf(symbol);
  const week = priceHistory(symbol, "1W", now);
  const last = week[week.length - 1];
  const dayAgo = week[week.length - 1 - 24];
  const change = !last || !dayAgo || dayAgo.p === 0 ? 0 : (last.p - dayAgo.p) / dayAgo.p;
  return {
    symbol: anchor.symbol,
    priceUsd: anchor.priceUsd,
    change24hPct: roundDigits(change, 6),
    multiplier: anchor.multiplier,
    updatedAt: new Date(last?.t ?? now).toISOString(),
    source: "mock",
  };
}
