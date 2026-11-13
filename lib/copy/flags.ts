import "server-only";

import { isRealTradingEnabled } from "@/lib/api/handler";
import { getFlag } from "@/lib/flags";

/**
 * Único punto de lectura de los flags de «Copiar carteras».
 *
 * Nadie más lee `copy_enabled`, `copy_buy_enabled`, `copy_billing_enabled` ni
 * sus variables de entorno: toda la app pasa por acá. Los tres flags nacen
 * apagados (`safeFlagDefault` → false y la migración los siembra en false) y
 * cada uno que mueve dinero suma un candado de entorno que también nace en
 * false. Si falta cualquier pieza, la operación no existe: nunca se falla
 * abierto.
 */

/** Nombres en `app_flags` (panel admin). */
export const COPY_FLAG_KEYS = {
  /** Toda la sección `/app/copiar`. */
  enabled: "copy_enabled",
  /** Copiar mezcla con dinero real. */
  realBuy: "copy_buy_enabled",
  /** Cobro de la suscripción. */
  billing: "copy_billing_enabled",
} as const;

/** `true` sólo con la variable en "true" (trim, sin distinguir mayúsculas). */
function envTrue(name: string): boolean {
  const raw = process.env[name];
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase() === "true";
}

/** `true` sólo con la variable presente y no vacía. Nunca se lee su valor. */
function envPresent(name: string): boolean {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim() !== "";
}

/** Credenciales mínimas de Mercado Pago (§1.1: sin ellas el cobro no existe). */
function mercadoPagoCredentialsReady(): boolean {
  return envPresent("MERCADOPAGO_ACCESS_TOKEN") && envPresent("MERCADOPAGO_WEBHOOK_SECRET");
}

/**
 * Desarrollo local (`NODE_ENV !== "production"`). En Vercel, preview y
 * producción corren con `NODE_ENV=production`, así que ahí manda el flag.
 */
export function isCopyDevMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * `copy_enabled`. Excepción de desarrollo (§1.1): con `NODE_ENV !== "production"`
 * la sección se puede probar sin encender el flag global. En producción SIEMPRE
 * manda el flag y su default es `false`.
 */
export async function isCopyEnabled(): Promise<boolean> {
  if (await getFlag(COPY_FLAG_KEYS.enabled)) return true;
  return isCopyDevMode();
}

/**
 * Copiar mezcla con dinero real. Doble candado (§1.1):
 * flag `copy_buy_enabled` **y** `COPY_REAL_BUY_READY === "true"` **y**
 * `isRealTradingEnabled()`; además la sección tiene que estar encendida.
 * Con cualquiera apagado, la cuenta real no puede copiar.
 */
export async function isCopyRealBuyEnabled(): Promise<boolean> {
  if (!(await isCopyEnabled())) return false;
  if (!(await getFlag(COPY_FLAG_KEYS.realBuy))) return false;
  if (!envTrue("COPY_REAL_BUY_READY")) return false;
  return isRealTradingEnabled();
}

/**
 * Cobro de la suscripción. Doble candado (§1.1): flag
 * `copy_billing_enabled` **y** `COPY_BILLING_READY === "true"` **y**
 * credenciales de Mercado Pago presentes. Con cualquiera apagado nada llama a
 * Mercado Pago y la página de planes muestra «Suscripción disponible pronto».
 */
export async function isCopyBillingEnabled(): Promise<boolean> {
  if (!(await isCopyEnabled())) return false;
  if (!(await getFlag(COPY_FLAG_KEYS.billing))) return false;
  if (!envTrue("COPY_BILLING_READY")) return false;
  return mercadoPagoCredentialsReady();
}

/** Mensaje por defecto cuando la sección está apagada. */
export const COPY_FEATURE_DISABLED_MESSAGE = "Copiar carteras no está disponible todavía.";

/**
 * 404 `FEATURE_DISABLED` de las APIs de Copiar, sin datos y sin pistas.
 * Las rutas lo devuelven como `Response`, así `handle` no lo envuelve.
 */
export function copyFeatureDisabledResponse(
  message: string = COPY_FEATURE_DISABLED_MESSAGE,
): Response {
  return Response.json(
    { ok: false, error: { code: "FEATURE_DISABLED", message } },
    { status: 404, headers: { "cache-control": "private, no-store" } },
  );
}
