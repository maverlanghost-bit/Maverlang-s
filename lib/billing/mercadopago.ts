import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { BILLING_PLAN_CATALOG } from "@/lib/billing/plans";
import {
  BillingProviderError,
  type BillingCheckout,
  type BillingCheckoutInput,
  type BillingProvider,
  type BillingSignatureCheck,
  type BillingStatus,
  type BillingSubscriptionState,
  type BillingWebhookInput,
} from "@/lib/billing/provider";

/**
 * Mercado Pago (suscripciones / preapproval) con `fetch` y `node:crypto`,
 * sin SDK y sin dependencias nuevas.
 *
 * - `Authorization: Bearer` sale SÓLO de `MERCADOPAGO_ACCESS_TOKEN` (servidor).
 * - Cada creación de checkout lleva `X-Idempotency-Key`.
 * - La firma del webhook es `x-signature: ts=…,v1=…`, HMAC-SHA256 de
 *   `id:{data.id};request-id:{x-request-id};ts:{ts};` con
 *   `MERCADOPAGO_WEBHOOK_SECRET`, comparada con `timingSafeEqual`.
 * - El estado NUNCA se lee del cuerpo del aviso: se re-consulta a la API.
 * - Ningún dato de tarjeta toca Maverlang: el pagador autoriza en Mercado Pago.
 */

const MP_API_BASE = "https://api.mercadopago.com";
/** Timeout de cada llamada: el webhook tiene que responder rápido. */
const MP_TIMEOUT_MS = 8_000;

function accessToken(): string {
  return (process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
}

function webhookSecret(): string {
  return (process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "").trim();
}

function planIdOf(plan: BillingCheckoutInput["plan"]): string {
  const envName = BILLING_PLAN_CATALOG[plan].planIdEnv;
  return (process.env[envName] ?? "").trim();
}

async function mpFetch(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown; idempotencyKey?: string },
): Promise<Response> {
  const token = accessToken();
  if (!token) throw new BillingProviderError("not_configured", "Mercado Pago no está configurado.");
  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.idempotencyKey) headers.set("X-Idempotency-Key", init.idempotencyKey);
  try {
    return await fetch(`${MP_API_BASE}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(MP_TIMEOUT_MS),
    });
  } catch {
    // Nunca se propaga el texto del error de red: puede llevar la URL interna.
    throw new BillingProviderError("upstream", "Mercado Pago no respondió.");
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function assertOk(response: Response, operation: string): Promise<void> {
  if (response.ok) return;
  // Sólo el código HTTP al log: el cuerpo de error puede traer datos del pagador.
  console.error(`mercadopago: ${operation} respondió HTTP ${response.status}.`);
  throw new BillingProviderError("upstream", "Mercado Pago rechazó la solicitud.");
}

/** Id de Mercado Pago: texto o número; nunca se acepta vacío ni ausente. */
const idSchema = z.preprocess(
  (value) => (typeof value === "number" ? String(value) : value),
  z.string().min(1),
);

const preapprovalSchema = z.object({
  id: idSchema,
  status: z.string().min(1),
  init_point: z.string().nullish(),
  sandbox_init_point: z.string().nullish(),
  external_reference: z.string().nullish(),
  payer_email: z.string().nullish(),
  next_payment_date: z.string().nullish(),
  auto_recurring: z
    .object({
      transaction_amount: z.preprocess(
        (value) => (typeof value === "string" ? Number(value) : value),
        z.number().nullish(),
      ),
      currency_id: z.string().nullish(),
    })
    .nullish(),
});

const authorizedPaymentSchema = z.object({
  id: idSchema,
  preapproval_id: idSchema,
  status: z.string().nullish(),
});

/** Estados de preapproval de Mercado Pago → vocabulario local. */
function mapPreapprovalStatus(raw: string): BillingStatus {
  switch (raw.trim().toLowerCase()) {
    case "authorized":
      return "active";
    case "paused":
      return "past_due";
    case "cancelled":
    case "canceled":
    case "finished":
      return "canceled";
    case "pending":
    default:
      return "pending";
  }
}

function toSubscriptionState(data: z.infer<typeof preapprovalSchema>): BillingSubscriptionState {
  const amount = data.auto_recurring?.transaction_amount;
  return {
    subscriptionId: data.id,
    status: mapPreapprovalStatus(data.status),
    rawStatus: data.status,
    externalReference: data.external_reference?.trim() || null,
    payerEmail: data.payer_email?.trim() || null,
    nextPaymentDate: data.next_payment_date?.trim() || null,
    amountClp: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
  };
}

interface ParsedSignature {
  ts: string;
  v1: string[];
}

/** `ts=1704908010,v1=abc…` → `{ ts, v1: [...] }`. Cualquier rareza → null. */
function parseSignatureHeader(header: string): ParsedSignature | null {
  let ts: string | null = null;
  const v1: string[] = [];
  for (const chunk of header.split(",")) {
    const [rawKey, ...rest] = chunk.split("=");
    const key = rawKey?.trim().toLowerCase() ?? "";
    const value = rest.join("=").trim();
    if (!value) continue;
    if (key === "ts") ts = value;
    else if (key === "v1") v1.push(value);
  }
  if (!ts || v1.length === 0) return null;
  if (!/^\d{1,20}$/.test(ts)) return null;
  return { ts, v1 };
}

/**
 * Verificación de la firma `x-signature` de Mercado Pago. Se exporta aparte
 * para poder probarla sin instanciar el proveedor (tests de S10).
 */
export function verifyMercadoPagoSignature(
  headers: Headers,
  dataId: string | null,
): BillingSignatureCheck {
  const secret = webhookSecret();
  if (!secret) return { valid: false, reason: "missing_secret" };
  const header = headers.get("x-signature");
  if (!header) return { valid: false, reason: "missing_signature" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: "malformed_signature" };
  const requestId = (headers.get("x-request-id") ?? "").trim();
  const normalizedId = (dataId ?? "").trim().toLowerCase();
  const tail = `request-id:${requestId};ts:${parsed.ts};`;
  // Plantilla documentada por Mercado Pago. Si el aviso no trae `data.id`,
  // se aceptan las dos variantes conocidas (con `id:` vacío y sin él).
  const manifests = normalizedId ? [`id:${normalizedId};${tail}`] : [`id:;${tail}`, tail];
  const provided = parsed.v1.find((value) => /^[0-9a-f]{64}$/i.test(value));
  if (!provided) return { valid: false, reason: "malformed_signature" };
  const candidate = Buffer.from(provided, "hex");
  for (const manifest of manifests) {
    const expected = createHmac("sha256", secret).update(manifest, "utf8").digest();
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { valid: true };
    }
  }
  return { valid: false, reason: "invalid_signature" };
}

async function fetchPreapprovalById(
  subscriptionId: string,
): Promise<BillingSubscriptionState | null> {
  const response = await mpFetch(`/preapproval/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
  });
  if (response.status === 404) return null;
  await assertOk(response, "fetchSubscription");
  const parsed = preapprovalSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new BillingProviderError("invalid_response", "Respuesta inesperada de Mercado Pago.");
  }
  return toSubscriptionState(parsed.data);
}

async function resolveWebhookState(
  dataId: string,
  eventType: string | null,
): Promise<BillingSubscriptionState | null> {
  const type = (eventType ?? "").trim().toLowerCase();
  if (type === "subscription_preapproval") return fetchPreapprovalById(dataId);
  if (type === "subscription_authorized_payment") {
    // `data.id` es el pago autorizado; el preapproval se consulta aparte.
    const response = await mpFetch(`/authorized_payments/${encodeURIComponent(dataId)}`, {
      method: "GET",
    });
    if (response.status === 404) return null;
    await assertOk(response, "resolveWebhookSubscription");
    const parsed = authorizedPaymentSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new BillingProviderError("invalid_response", "Respuesta inesperada de Mercado Pago.");
    }
    return fetchPreapprovalById(parsed.data.preapproval_id);
  }
  // `payment`, `plan` y cualquier otro aviso no cambian la suscripción.
  return null;
}

export const mercadoPagoProvider: BillingProvider = {
  name: "mercadopago",

  isConfigured(): boolean {
    // Token y secreto de webhook: sin secreto no se podría verificar el aviso
    // y el usuario podría pagar sin recibir acceso. Se exigen ambos.
    return Boolean(accessToken()) && Boolean(webhookSecret());
  },

  async createCheckout(input: BillingCheckoutInput): Promise<BillingCheckout> {
    const plan = BILLING_PLAN_CATALOG[input.plan];
    const trialDays = Math.max(0, Math.trunc(input.trialDays));
    const planId = planIdOf(input.plan);

    // Cuerpo mínimo, sin ningún dato de tarjeta.
    const body: Record<string, unknown> = {
      reason: plan.reason,
      external_reference: input.userId,
      payer_email: input.email,
      back_url: input.backUrl,
    };

    if (planId && trialDays === 0) {
      // Plan ya creado en Mercado Pago (monto y frecuencia viven allá).
      body.preapproval_plan_id = planId;
    } else {
      body.auto_recurring = {
        frequency: plan.frequency,
        frequency_type: plan.frequencyType,
        transaction_amount: plan.amountClp,
        currency_id: "CLP",
        // Con plan propio no se puede inyectar `free_trial`: por eso la rama
        // de arriba sólo se usa cuando el usuario ya gastó su prueba.
        ...(trialDays > 0
          ? { free_trial: { frequency: trialDays, frequency_type: "days" } }
          : {}),
      };
    }

    const response = await mpFetch("/preapproval", {
      method: "POST",
      body,
      idempotencyKey: randomUUID(),
    });
    await assertOk(response, "createCheckout");
    const parsed = preapprovalSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new BillingProviderError("invalid_response", "Respuesta inesperada de Mercado Pago.");
    }
    const initPoint = parsed.data.init_point?.trim() || parsed.data.sandbox_init_point?.trim() || "";
    if (!initPoint) {
      throw new BillingProviderError("invalid_response", "Mercado Pago no entregó el checkout.");
    }
    return {
      provider: "mercadopago",
      subscriptionId: parsed.data.id,
      initPoint,
      status: mapPreapprovalStatus(parsed.data.status),
    };
  },

  async cancel(subscriptionId: string): Promise<{ canceled: boolean; rawStatus: string }> {
    const response = await mpFetch(`/preapproval/${encodeURIComponent(subscriptionId)}`, {
      method: "PUT",
      body: { status: "cancelled" },
    });
    await assertOk(response, "cancel");
    const parsed = preapprovalSchema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new BillingProviderError("invalid_response", "Respuesta inesperada de Mercado Pago.");
    }
    return {
      canceled: mapPreapprovalStatus(parsed.data.status) === "canceled",
      rawStatus: parsed.data.status,
    };
  },

  verifyWebhook(input: BillingWebhookInput): BillingSignatureCheck {
    return verifyMercadoPagoSignature(input.headers, input.dataId);
  },

  async fetchSubscription(subscriptionId: string): Promise<BillingSubscriptionState | null> {
    return fetchPreapprovalById(subscriptionId);
  },

  async resolveWebhookSubscription(
    dataId: string,
    eventType: string | null,
  ): Promise<BillingSubscriptionState | null> {
    return resolveWebhookState(dataId, eventType);
  },
};
