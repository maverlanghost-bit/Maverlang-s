import "server-only";

import { isCopyBillingEnabled } from "@/lib/copy/flags";

import type { BillingPlanId } from "@/lib/billing/plans";

/**
 * Interfaz única del cobro. Hoy el único proveedor es Mercado Pago
 * (`lib/billing/mercadopago.ts`), pero las rutas y el store hablan sólo con
 * esta interfaz: cambiar de proveedor no toca las rutas.
 *
 * Reglas del contrato (§3 S4):
 * - El estado SIEMPRE se re-consulta a la API del proveedor, nunca se toma
 *   del cuerpo del webhook.
 * - El webhook se verifica con `verifyWebhook` (firma HMAC) antes de leer
 *   nada más.
 * - Ningún dato de tarjeta pasa por Maverlang: el pagador autoriza en el
 *   sitio del proveedor.
 */

export type BillingProviderName = "mercadopago";

/**
 * Estado local de una suscripción. Es el vocabulario que lee
 * `lib/copy/access.ts` (S3): `none | trial | active | past_due | canceled`.
 * `pending` es interno (checkout creado, todavía sin autorizar) y para el
 * paywall equivale a sin acceso.
 */
export type BillingStatus = "pending" | "trial" | "active" | "past_due" | "canceled";

export interface BillingCheckoutInput {
  userId: string;
  /** Correo verificado de la sesión: Mercado Pago lo exige como `payer_email`. */
  email: string;
  plan: BillingPlanId;
  /** Días de prueba gratis; 0 si el usuario ya usó la suya. */
  trialDays: number;
  /** URL de vuelta, siempre construida en el servidor. */
  backUrl: string;
}

export interface BillingCheckout {
  provider: BillingProviderName;
  /** Id del preapproval en el proveedor. */
  subscriptionId: string;
  /** URL a la que se redirige al usuario para autorizar el cobro. */
  initPoint: string;
  status: BillingStatus;
}

export interface BillingSubscriptionState {
  subscriptionId: string;
  /** Estado ya traducido al vocabulario local. */
  status: BillingStatus;
  /** Estado crudo del proveedor, sólo para logs y diagnóstico. */
  rawStatus: string;
  /** `external_reference` que puso Maverlang al crear el checkout (user id). */
  externalReference: string | null;
  payerEmail: string | null;
  /** Próximo cobro según el proveedor (ISO 8601) o null. */
  nextPaymentDate: string | null;
  /** Monto recurrente en CLP, si el proveedor lo informa. */
  amountClp: number | null;
}

export type BillingSignatureReason =
  | "missing_secret"
  | "missing_signature"
  | "malformed_signature"
  | "invalid_signature";

export type BillingSignatureCheck =
  | { valid: true }
  | { valid: false; reason: BillingSignatureReason };

export interface BillingWebhookInput {
  headers: Headers;
  /** `data.id` del aviso (query o cuerpo), ya normalizado a texto. */
  dataId: string | null;
}

export interface BillingProvider {
  readonly name: BillingProviderName;
  /** Credenciales completas (token + secreto de webhook) presentes. */
  isConfigured(): boolean;
  createCheckout(input: BillingCheckoutInput): Promise<BillingCheckout>;
  cancel(subscriptionId: string): Promise<{ canceled: boolean; rawStatus: string }>;
  verifyWebhook(input: BillingWebhookInput): BillingSignatureCheck;
  fetchSubscription(subscriptionId: string): Promise<BillingSubscriptionState | null>;
  /**
   * Traduce un aviso del webhook al estado real de una suscripción, siempre
   * consultando la API. Devuelve null si el tipo de aviso no aplica.
   */
  resolveWebhookSubscription(
    dataId: string,
    eventType: string | null,
  ): Promise<BillingSubscriptionState | null>;
}

export class BillingProviderError extends Error {
  readonly reason: "not_configured" | "upstream" | "invalid_response";

  constructor(reason: "not_configured" | "upstream" | "invalid_response", message: string) {
    super(message);
    this.name = "BillingProviderError";
    this.reason = reason;
  }
}

/**
 * Proveedor actual, o null si faltan credenciales. La importación es
 * dinámica para que `provider.ts` (interfaz) no dependa del SDK casero de
 * Mercado Pago al cargarse.
 */
export async function getBillingProvider(): Promise<BillingProvider | null> {
  const { mercadoPagoProvider } = await import("@/lib/billing/mercadopago");
  return mercadoPagoProvider.isConfigured() ? mercadoPagoProvider : null;
}

export type BillingGate =
  | { ok: true; provider: BillingProvider }
  | { ok: false; reason: "flag_off" | "env_off" | "no_credentials" };

/**
 * Doble candado del cobro (§1.1): flag `copy_billing_enabled` (leído SÓLO
 * por `lib/copy/flags.ts`) **y** `COPY_BILLING_READY === "true"` **y**
 * credenciales de Mercado Pago. Si falta cualquiera, no se cobra.
 */
export async function billingGate(): Promise<BillingGate> {
  if (!(await isCopyBillingEnabled())) return { ok: false, reason: "flag_off" };
  if ((process.env.COPY_BILLING_READY ?? "").trim().toLowerCase() !== "true") {
    return { ok: false, reason: "env_off" };
  }
  const provider = await getBillingProvider();
  if (!provider) return { ok: false, reason: "no_credentials" };
  return { ok: true, provider };
}

/** `true` sólo si el cobro está realmente disponible (mismo candado que el checkout). */
export async function isBillingEnabledForUi(): Promise<boolean> {
  return (await billingGate()).ok;
}

/**
 * Verifica la firma de un aviso sin exigir que el cobro esté encendido: el
 * webhook debe seguir validando y registrando idempotencia con el flag
 * apagado (sólo no activa nada).
 */
export async function verifyBillingWebhook(
  input: BillingWebhookInput,
): Promise<BillingSignatureCheck> {
  const { mercadoPagoProvider } = await import("@/lib/billing/mercadopago");
  return mercadoPagoProvider.verifyWebhook(input);
}

/**
 * Estado local a partir del estado del proveedor. `trial` gana mientras el
 * período de prueba siga vigente; después, `authorized` = `active`.
 */
export function localStatusFromProvider(
  providerStatus: BillingStatus,
  trialEndsAt: string | null,
  nowMs: number = Date.now(),
): BillingStatus {
  if (providerStatus === "canceled" || providerStatus === "past_due") return providerStatus;
  if (providerStatus === "active" || providerStatus === "trial") {
    if (trialEndsAt) {
      const end = Date.parse(trialEndsAt);
      if (Number.isFinite(end) && end > nowMs) return "trial";
    }
    return "active";
  }
  return "pending";
}

/** `true` si la fila todavía da acceso (para bloquear un segundo checkout). */
export function isCurrentSubscription(
  row: { status: BillingStatus; currentPeriodEnd: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (row.status === "active" || row.status === "past_due") return true;
  if (row.status === "trial") {
    if (!row.currentPeriodEnd) return true;
    const end = Date.parse(row.currentPeriodEnd);
    return !Number.isFinite(end) || end > nowMs;
  }
  return false;
}
