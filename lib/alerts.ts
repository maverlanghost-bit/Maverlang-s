/**
 * Avisos al operador (M55). Hoy sólo escribe en el log del servidor:
 * M61 conecta Sentry y M51 el correo.
 */

export interface SafetyTransition {
  symbol: string;
  before: string;
  after: string;
  reasons: string[];
}

/** true cuando el cambio cruza `listed` (listed→watch/hidden o al revés). */
export function isListedCrossing(before: string, after: string): boolean {
  return (before === "listed") !== (after === "listed");
}

/**
 * Avisa un cambio de estado de seguridad. Hoy: `console.warn` con el
 * formato `[catalog-health] AAPLx listed→watch: motivo`.
 */
export function notifyOps(transition: SafetyTransition): void {
  const reason = transition.reasons[0] ?? transition.after;
  console.warn(`[catalog-health] ${transition.symbol} ${transition.before}→${transition.after}: ${reason}`);
}
