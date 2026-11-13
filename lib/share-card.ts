/**
 * Utilidades puras de la tarjeta para compartir.
 *
 * Las usan el route handler `app/tarjeta/[id]/route.tsx` (servidor) y el botón
 * `components/domain/share-card-button.tsx` (cliente), así que este archivo no
 * importa `server-only` ni APIs de Node.
 */

/** Rango aceptado para la variación. No es un monto: es un porcentaje. */
const MIN_SHARE_PCT = -100;
const MAX_SHARE_PCT = 10000;

const pctFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});

/** Acota a [-100, 10000] y deja un decimal. Nunca devuelve -0. */
function clampPct(value: number): number {
  const bounded = Math.min(MAX_SHARE_PCT, Math.max(MIN_SHARE_PCT, value));
  const rounded = Math.round(bounded * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Lee `?pct=` sin confiar en la URL: sólo un número finito, acotado a
 * [-100, 10000] y con un decimal. Cualquier otra cosa devuelve null.
 */
export function parseSharePct(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return clampPct(value);
}

/** "+12,3 %" / "-4,0 %". */
export function formatSharePct(pct: number): string {
  const value = Number.isFinite(pct) ? clampPct(pct) : 0;
  return `${pctFormatter.format(value)} %`;
}

/** `/tarjeta/{id}` y `?pct=` sólo cuando hay un porcentaje válido. */
export function shareCardPath(id: string, pct?: number | null): string {
  const path = `/tarjeta/${encodeURIComponent(id.trim())}`;
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return path;
  return `${path}?pct=${clampPct(pct)}`;
}
