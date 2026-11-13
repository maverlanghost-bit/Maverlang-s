import { createHash } from "node:crypto";

import { assertSameOrigin, handle, parseJson, parseQuery } from "@/lib/api/handler";
import { billingWebhookBodySchema, billingWebhookQuerySchema } from "@/lib/billing/contracts";
import { COPY_PLANS, type BillingPlanId } from "@/lib/billing/plans";
import {
  getBillingProvider,
  localStatusFromProvider,
  verifyBillingWebhook,
} from "@/lib/billing/provider";
import {
  getBillingSubscription,
  markBillingEventProcessed,
  recordBillingEvent,
  saveSubscriptionState,
} from "@/lib/billing/store";
import { isCopyBillingEnabled } from "@/lib/copy/flags";
import { withRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/billing/webhook — avisos de Mercado Pago.
 *
 * Orden fijo:
 * 1. rate limit `webhook` (por IP; la firma se verifica aparte);
 * 2. firma `x-signature` (HMAC-SHA256 con `MERCADOPAGO_WEBHOOK_SECRET`);
 * 3. idempotencia por `provider_event_id` en `billing_events` (duplicado → 200);
 * 4. si `copy_billing_enabled` está apagado, se registra el aviso y NO se
 *    activa nada (200 igual, para que Mercado Pago no reintente);
 * 5. el estado se re-consulta SIEMPRE a la API, nunca se lee del cuerpo.
 *
 * Está exento de `Origin` en `lib/api/handler.ts` porque lo llama Mercado
 * Pago, no un navegador: `assertSameOrigin` pasa de largo para esta ruta y la
 * autenticidad la da la firma.
 */

const MAX_WEBHOOK_BYTES = 32_768;

const USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readId(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Id de aviso de Mercado Pago: siempre numérico. Otro texto no sirve como clave. */
function readEventId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^\d{1,20}$/.test(value.trim())) return value.trim();
  return null;
}

function plain(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function planFromAmount(amountClp: number | null): BillingPlanId | null {
  if (amountClp === COPY_PLANS.monthly.clp) return "monthly";
  if (amountClp === COPY_PLANS.annual.clp) return "annual";
  return null;
}

export function POST(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "webhook");
    if (ipLimited) return ipLimited;

    // Exenta de Origin (ver el comentario de arriba): la firma manda.
    assertSameOrigin(req);
    const query = parseQuery(req, billingWebhookQuerySchema);
    const body = await parseJson(req, billingWebhookBodySchema, { maxBytes: MAX_WEBHOOK_BYTES });

    // El `data.id` de la firma viaja en la query (documentación de Mercado
    // Pago); el cuerpo queda como respaldo. Nunca se usa para decidir estado.
    const dataId = readId(query["data.id"]) ?? readId(asRecord(body.data)?.id);
    const eventType = readString(body.type) ?? readString(query.type);

    const signature = await verifyBillingWebhook({ headers: req.headers, dataId });
    if (!signature.valid) {
      // Sin firma válida no se registra ni se procesa nada.
      return plain(401, "UNAUTHORIZED", "Firma del aviso inválida.");
    }

    const payloadHash = createHash("sha256").update(JSON.stringify(body), "utf8").digest("hex");
    const providerEventId =
      readEventId(body.id) ??
      `mp:${eventType ?? "desconocido"}:${dataId ?? "sin_id"}:${payloadHash.slice(0, 32)}`;
    const event = await recordBillingEvent({
      provider: "mercadopago",
      eventId: providerEventId,
      type: eventType ?? "desconocido",
      payloadHash,
    });
    if (event.duplicate) return { received: true, duplicate: true };
    if (event.failed) {
      // Sin idempotencia garantizada no se activa nada: se responde 200 para
      // no entrar en un bucle de reintentos mientras la migración no exista.
      return { received: true, processed: false };
    }

    if (!(await isCopyBillingEnabled())) {
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "billing_disabled" };
    }

    if (!dataId) {
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "missing_data_id" };
    }

    const provider = await getBillingProvider();
    if (!provider) {
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "no_credentials" };
    }

    const state = await provider.resolveWebhookSubscription(dataId, eventType);
    if (!state) {
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "unhandled_type" };
    }

    const userId = state.externalReference;
    if (!userId || !USER_ID_RE.test(userId)) {
      console.warn("billing: aviso con external_reference inválida; se ignora.");
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "bad_reference" };
    }

    const existing = await getBillingSubscription(userId);
    if (!existing) {
      // El checkout siempre deja la fila antes de entregar el link de pago.
      // Sin fila no se concede acceso por un aviso suelto.
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "unknown_subscription" };
    }
    if (existing.provider && existing.provider !== "mercadopago") {
      // La fila la administra otro proveedor (p. ej. Fraccion Pro): no se pisa.
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "other_provider" };
    }
    if (
      existing.providerSubscriptionId &&
      existing.providerSubscriptionId !== state.subscriptionId
    ) {
      // Aviso de un preapproval viejo: la fila ya apunta a otro.
      await markBillingEventProcessed(event.id);
      return { received: true, processed: false, reason: "stale_subscription" };
    }

    // Un `pending` del proveedor no le quita el acceso a quien ya lo tenía.
    const keepAccess =
      state.status === "pending" && (existing.status === "trial" || existing.status === "active");
    const status = keepAccess
      ? existing.status
      : localStatusFromProvider(state.status, existing.trialEndsAt);
    const currentPeriodEnd =
      state.nextPaymentDate ??
      existing.currentPeriodEnd ??
      (status === "trial" ? existing.trialEndsAt : null);

    await saveSubscriptionState({
      userId,
      status,
      provider: "mercadopago",
      providerSubscriptionId: state.subscriptionId,
      plan: planFromAmount(state.amountClp) ?? existing.plan,
      currentPeriodEnd,
      // Si el proveedor informa la baja, se registra cuándo; no se inventa.
      ...(status === "canceled"
        ? { cancelAt: existing.cancelAt ?? new Date().toISOString() }
        : {}),
    });
    await markBillingEventProcessed(event.id);

    return { received: true, processed: true, status };
  });
}
