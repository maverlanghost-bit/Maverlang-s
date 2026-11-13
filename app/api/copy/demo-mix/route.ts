import { DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";
import { assertSameOrigin, handle, parseJson, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import {
  copyAccessDenied,
  copyDemoMixRequestSchema,
  copyFeatureDisabled,
  copyPlanTokenPayloadSchema,
  type CopyPlanTokenPayload,
} from "@/lib/copy/contracts";
import { isCopyEnabled } from "@/lib/copy/flags";
import { verifyPlan } from "@/lib/copy/plan-token";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";
/** Hasta 25 piernas en serie contra la demo: cada una cotiza, arma y confirma. */
export const maxDuration = 30;

/** Una pierna ejecutada. `error` sólo lleva el mensaje de dominio, nunca infra. */
type DemoMixLeg = {
  symbol: string;
  usd: number;
  status: "bought" | "skipped";
  orderId: string | null;
  error?: string;
};

/**
 * Verifica el `planId` con `plan-token.ts` (S2) y valida la forma del payload
 * con el contrato de esta ruta. Vencido, con otra firma o de otra persona →
 * 400: el carrito tiene que volver a armar la mezcla.
 */
function readPlanToken(token: string, userId: string): CopyPlanTokenPayload {
  const verified = verifyPlan(token, userId);
  const parsed = copyPlanTokenPayloadSchema.safeParse(verified);
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "El plan venció. Vuelve a armar la mezcla.");
  }
  return parsed.data;
}

function reasonOf(error: unknown): string {
  // Sólo mensajes de dominio (los escribe el servidor); el resto, genérico.
  if (error instanceof DomainError) return error.message;
  return "No se pudo completar esta pierna.";
}

/**
 * POST /api/copy/demo-mix
 *
 * Mezcla demo en un clic (§1.11): recorre las piernas del plan EN SERIE con
 * `demoSupabase.trade.quote → build → submit`, sin firma. La "transacción
 * firmada" es la que devuelve `build` (la demo no toca la red).
 * No acepta pesos del cliente: las piernas salen del plan firmado.
 */
export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    if (!(await isCopyEnabled())) return copyFeatureDisabled();

    const services = getServices();
    const session = await requireSession(services, req);
    const limited = await withRateLimit(req, "demoTrade", [session.userId]);
    if (limited) return limited;

    const body = await parseJson(req, copyDemoMixRequestSchema);
    const denied = await copyAccessDenied(session.userId);
    if (denied) return denied;

    // Sin secreto no hay `planId` verificable: 503 antes de tocar la demo.
    if (process.env.NODE_ENV === "production" && !process.env.COPY_PLAN_HMAC_SECRET?.trim()) {
      return copyFeatureDisabled("La firma de planes no está configurada todavía.", 503);
    }
    const plan = readPlanToken(body.planId, session.userId);
    if (plan.account !== "demo") {
      throw new DomainError("VALIDATION", "Este plan es para la cuenta real.");
    }

    // La demo no firma: `build` sólo pide una clave con forma válida y nunca sale
    // de la cuenta demo. Sin billetera en la sesión se usa la del usuario demo.
    const userPublicKey = session.walletAddress ?? DEMO_WALLET_ADDRESS;

    const legs: DemoMixLeg[] = [];
    for (const leg of plan.legs) {
      try {
        const quote = await demoSupabase.trade.quote(session.userId, {
          side: "buy",
          symbol: leg.symbol,
          amount: leg.usd,
          amountCurrency: "USDC",
        });
        const build = await demoSupabase.trade.build(session.userId, {
          quoteId: quote.id,
          userPublicKey,
        });
        const submit = await demoSupabase.trade.submit(session.userId, {
          requestId: build.requestId,
          signedTransactionBase64: build.transactionBase64,
        });
        const bought = submit.status === "confirmed";
        const row: DemoMixLeg = {
          symbol: leg.symbol,
          usd: leg.usd,
          status: bought ? "bought" : "skipped",
          orderId: submit.orderId,
        };
        if (!bought) row.error = "La orden demo no se confirmó.";
        legs.push(row);
      } catch (error) {
        legs.push({
          symbol: leg.symbol,
          usd: leg.usd,
          status: "skipped",
          orderId: null,
          error: reasonOf(error),
        });
      }
    }

    const bought = legs.filter((leg) => leg.status === "bought").length;
    return {
      slug: plan.slug,
      versionId: plan.versionId,
      totalUsd: plan.totalUsd,
      coveragePct: plan.coveragePct,
      bought,
      skipped: legs.length - bought,
      legs,
    };
  });
}
