import { assertSameOrigin, handle, parseJson, requireSupabaseUser } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { billingCancelBodySchema } from "@/lib/billing/contracts";
import { BillingProviderError, getBillingProvider } from "@/lib/billing/provider";
import { getBillingSubscription, saveSubscriptionState } from "@/lib/billing/store";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/**
 * POST /api/billing/cancel — cancelar en un clic (Ley Pro Consumidor).
 *
 * La cancelación NO depende del flag de cobro: si alguien ya tiene una
 * suscripción, tiene que poder cerrarla aunque el cobro esté apagado. Se
 * cancela en Mercado Pago y se refleja en la fila local conservando
 * `current_period_end`: el acceso sigue hasta el final del período pagado
 * (lo resuelve `lib/copy/access.ts`, S3).
 */
export function POST(req: Request) {
  return handle("no-store", async () => {
    assertSameOrigin(req);
    const ipLimited = await withRateLimit(req, "me");
    if (ipLimited) return ipLimited;

    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    if (!session) throw new DomainError("UNAUTHORIZED");

    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;

    // Sin cuerpo: se acepta vacío o `{}`, y cualquier campo extra es 400.
    await parseJson(req, billingCancelBodySchema);

    const row = await getBillingSubscription(session.userId);
    if (!row) throw new DomainError("NOT_FOUND", "No encontramos una suscripción tuya.");
    if (row.status === "canceled") {
      return {
        status: "canceled" as const,
        cancelAt: row.cancelAt,
        currentPeriodEnd: row.currentPeriodEnd,
      };
    }
    if (row.provider && row.provider !== "mercadopago") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION",
            message: "Tu suscripción viene de Fraccion Pro: se administra en fraccion.si.",
          },
        },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    if (!row.providerSubscriptionId) {
      throw new DomainError("NOT_FOUND", "No encontramos una suscripción tuya.");
    }

    const provider = await getBillingProvider();
    if (!provider) {
      throw new DomainError(
        "UPSTREAM",
        "No pudimos cancelar con Mercado Pago ahora. Escríbenos y lo hacemos nosotros.",
      );
    }

    let result: { canceled: boolean; rawStatus: string } | null = null;
    try {
      result = await provider.cancel(row.providerSubscriptionId);
    } catch (error) {
      if (error instanceof BillingProviderError) {
        throw new DomainError(
          "UPSTREAM",
          "No pudimos cancelar con Mercado Pago ahora. Intenta de nuevo en unos minutos.",
        );
      }
      throw error;
    }
    if (!result?.canceled) {
      // Mercado Pago no confirmó la cancelación: no se miente en la base.
      throw new DomainError(
        "UPSTREAM",
        "Mercado Pago no confirmó la cancelación. Intenta de nuevo en unos minutos.",
      );
    }

    const cancelAt = new Date().toISOString();
    await saveSubscriptionState({
      userId: session.userId,
      status: "canceled",
      provider: "mercadopago",
      providerSubscriptionId: row.providerSubscriptionId,
      plan: row.plan,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAt,
    });

    return { status: "canceled" as const, cancelAt, currentPeriodEnd: row.currentPeriodEnd };
  });
}
