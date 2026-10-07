/**
 * Despegue pozo vs mercado (N15). El titular es el precio ejecutable del pozo
 * en Solana; `marketPriceUsd` es lo que vale la acción en el mercado.
 * Puro y testeable.
 */

/** A partir de este despegue se avisa en la ficha (1%). */
export const POOL_DISLOCATION_ALERT_PCT = 0.01;

/** (pozo − mercado) / mercado, con signo. null sin datos válidos. */
export function poolDislocationPct(poolUsd: number, marketUsd: number | undefined): number | null {
  if (!Number.isFinite(poolUsd) || poolUsd <= 0) return null;
  if (marketUsd === undefined || !Number.isFinite(marketUsd) || marketUsd <= 0) return null;
  return (poolUsd - marketUsd) / marketUsd;
}

/** true cuando el despegue alcanza el umbral de aviso. */
export function poolDislocated(poolUsd: number, marketUsd: number | undefined): boolean {
  const pct = poolDislocationPct(poolUsd, marketUsd);
  return pct !== null && Math.abs(pct) >= POOL_DISLOCATION_ALERT_PCT;
}
