/**
 * Modelo del on-ramp (M58). Puro, sin `server-only`: lo usan `lib/env.ts`
 * (validación) y los tests.
 *
 * - `widget`: widget en modelo directo (M80). Único válido en producción.
 * - `api`: comercio por API (cotización + deal con PAYIN a la cuenta de
 *   Maverlang). Descartado: sólo desarrollo, y `M75` puede necesitar el
 *   código del adaptador. Con `NODE_ENV=production` el arranque falla.
 */

export const ONRAMP_MODELS = ["widget", "api"] as const;

export type OnrampModel = (typeof ONRAMP_MODELS)[number];

/** Sin variable o con otro valor → `widget` (nunca rompe el arranque). */
export function resolveOnrampModel(value: unknown): OnrampModel {
  if (value === "api") return "api";
  return "widget";
}

/** `api` no se puede elegir con `NODE_ENV=production`. */
export function isOnrampModelSelectable(model: OnrampModel, nodeEnv: string | undefined): boolean {
  if (model === "api" && nodeEnv === "production") return false;
  return true;
}
