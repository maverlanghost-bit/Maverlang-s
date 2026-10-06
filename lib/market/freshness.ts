/**
 * Ayudas puras para el indicador "Actualizado hace Xs" (M41).
 * Sin React ni red: la parte con intervalo vive en
 * `components/domain/price-freshness.tsx`.
 */

export type FreshnessLang = "es-CL" | "en";

/** ms de `at` (ISO, timestamp o Date). null si no hay fecha válida. */
export function parseUpdatedAt(at: string | number | Date | null | undefined): number | null {
  if (at === null || at === undefined) return null;
  if (typeof at === "number") return Number.isFinite(at) ? at : null;
  if (at instanceof Date) {
    const ms = at.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof at === "string") {
    const ms = Date.parse(at);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Segundos entre `nowMs` y `atMs`, nunca negativos. */
export function elapsedSeconds(nowMs: number, atMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(atMs)) return 0;
  return Math.max(0, Math.floor((nowMs - atMs) / 1000));
}

/** Con retraso cuando la quote viene `stale` o pasaron más de 60 s. */
export function freshnessDelayed(elapsedSec: number, stale: boolean): boolean {
  return stale === true || elapsedSec > 60;
}

/** "Actualizado hace 5 s" / "Actualizado hace 1 min" (EN "Updated Xs ago"). */
export function formatFreshness(elapsedSec: number, lang: FreshnessLang): string {
  const seconds = Math.max(0, Math.floor(elapsedSec));
  if (lang === "en") {
    if (seconds < 60) return `Updated ${seconds}s ago`;
    return `Updated ${Math.floor(seconds / 60)} min ago`;
  }
  if (seconds < 60) return `Actualizado hace ${seconds} s`;
  return `Actualizado hace ${Math.floor(seconds / 60)} min`;
}

/**
 * Marcador estable pre-hidratación (M42b): misma altura que el relativo (una
 * línea `text-xs`), sin depender de la hora. Idéntico en servidor y cliente.
 * Es un espacio duro (U+00A0) construido por código para que no colapse.
 */
export const FRESHNESS_PLACEHOLDER_TEXT = String.fromCharCode(160);

/**
 * Texto del indicador según montaje (M42b): antes de montar devuelve el
 * marcador estable; después, el relativo de siempre.
 */
export function resolveFreshnessText(mounted: boolean, elapsedSec: number, lang: FreshnessLang): string {
  if (!mounted) return FRESHNESS_PLACEHOLDER_TEXT;
  return formatFreshness(elapsedSec, lang);
}
