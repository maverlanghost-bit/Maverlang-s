import { handle, requireSupabaseUser } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { BILLING_PLAN_CATALOG, BILLING_PLAN_IDS } from "@/lib/billing/plans";
import { isBillingEnabledForUi } from "@/lib/billing/provider";
import { getBillingSubscription } from "@/lib/billing/store";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/**
 * GET /api/billing/status — estado de la suscripción del usuario.
 *
 * `billingEnabled: false` = cobro apagado (flag, `COPY_BILLING_READY` o
 * credenciales): la UI de planes (S9) muestra los precios con
 * `COPY_BILLING_SOON` y no ofrece pagar.
 */
export function GET(req: Request) {
  return handle("private", async () => {
    const ipLimited = await withRateLimit(req, "me");
    if (ipLimited) return ipLimited;

    const services = getServices();
    const session = await requireSupabaseUser(services, req);
    if (!session) throw new DomainError("UNAUTHORIZED");

    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;

    const [row, billingEnabled] = await Promise.all([
      getBillingSubscription(session.userId),
      isBillingEnabledForUi(),
    ]);

    return {
      billingEnabled,
      plans: BILLING_PLAN_IDS.map((id) => ({
        id,
        label: BILLING_PLAN_CATALOG[id].label,
        amountClp: BILLING_PLAN_CATALOG[id].amountClp,
      })),
      subscription: row
        ? {
            status: row.status,
            plan: row.plan,
            provider: row.provider,
            trialEndsAt: row.trialEndsAt,
            currentPeriodEnd: row.currentPeriodEnd,
            cancelAt: row.cancelAt,
          }
        : null,
      trialUsed: Boolean(row?.trialEndsAt),
    };
  });
}
