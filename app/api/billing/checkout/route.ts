import { z } from "zod";

import { assertSameOrigin, handle, parseJson, requireSupabaseUser } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { BILLING_PLAN_IDS, BILLING_RETURN_PATH, TRIAL_DAYS } from "@/lib/billing/plans";
import {
  BillingProviderError,
  billingGate,
  isCurrentSubscription,
  type BillingCheckout,
} from "@/lib/billing/provider";
import { beginSubscription, getBillingSubscription } from "@/lib/billing/store";
import { publicEnv } from "@/lib/env";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/**
 * POST /api/billing/checkout — crea el preapproval de Mercado Pago.
 *
 * Doble candado: si `copy_billing_enabled` está apagado, `COPY_BILLING_READY`
 * no es "true" o faltan credenciales, responde 403 `FEATURE_DISABLED` y no se
 * llama a Mercado Pago. La vuelta del checkout NO da acceso: eso lo decide el
 * webhook con el estado re-consultado a la API.
 */

const checkoutBodySchema = z
  .object({
    plan: z.enum(BILLING_PLAN_IDS),
  })
  .strict();

function featureDisabled(): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: "FEATURE_DISABLED",
        message: "El cobro de Copiar todavía no está disponible.",
      },
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

function conflict(message: string): Response {
  return Response.json(
    { ok: false, error: { code: "VALIDATION", message } },
    { status: 409, headers: { "cache-control": "no-store" } },
  );
}

export function POST(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "me");
    if (ipLimited) return ipLimited;

    // Primero el candado del cobro: con el flag apagado no se toca nada más.
    const gate = await billingGate();
    if (!gate.ok) return featureDisabled();

    assertSameOrigin(req);

    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    if (!session) throw new DomainError("UNAUTHORIZED");

    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;

    const body = await parseJson(req, checkoutBodySchema);
    const email = session.email?.trim() ?? "";
    if (!email || session.emailVerified !== true) {
      throw new DomainError("VALIDATION", "Necesitas un correo verificado para suscribirte.");
    }

    const current = await getBillingSubscription(session.userId);
    if (current && isCurrentSubscription(current)) {
      return conflict("Ya tienes una suscripción activa a Copiar.");
    }

    // La prueba se ofrece una sola vez por usuario (marca `trial_ends_at`).
    const trialDays = current?.trialEndsAt ? 0 : TRIAL_DAYS;
    const backUrl = new URL(BILLING_RETURN_PATH, publicEnv.NEXT_PUBLIC_SITE_URL).toString();

    // Mercado Pago primero: si rechaza, no se deja una fila `pending` huérfana.
    let checkout: BillingCheckout | null = null;
    try {
      checkout = await gate.provider.createCheckout({
        userId: session.userId,
        email,
        plan: body.plan,
        trialDays,
        backUrl,
      });
    } catch (error) {
      if (error instanceof BillingProviderError) {
        throw new DomainError(
          "UPSTREAM",
          "No pudimos iniciar el pago con Mercado Pago. Intenta de nuevo en unos minutos.",
        );
      }
      throw error;
    }
    if (!checkout) {
      throw new DomainError("UPSTREAM", "No pudimos iniciar el pago con Mercado Pago.");
    }
    const { trialEndsAt } = await beginSubscription({
      userId: session.userId,
      plan: body.plan,
      provider: checkout.provider,
      providerSubscriptionId: checkout.subscriptionId,
      trialDays,
    });

    return {
      provider: checkout.provider,
      plan: body.plan,
      initPoint: checkout.initPoint,
      subscriptionId: checkout.subscriptionId,
      trialDays,
      trialEndsAt,
    };
  });
}
