import { readFlagValue } from "@/lib/admin/store";
import { assertSameOrigin, handle, isUserDemoRequest, parseJson, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { COPY_REAL_DISABLED } from "@/content/copy-legal";
import {
  copyAccessDenied,
  copyFeatureDisabled,
  copyPlanRequestSchema,
  type CopyPlanTokenPayload,
} from "@/lib/copy/contracts";
import { getCopyIndex, getCopyPortfolio, isCopyFrozenByFeed } from "@/lib/copy/feed";
import { isCopyEnabled, isCopyRealBuyEnabled } from "@/lib/copy/flags";
import { COPY_COVERAGE_MIN_PCT, buildCopyPlan } from "@/lib/copy/plan";
import { COPY_PLAN_TTL_MS, signPlan } from "@/lib/copy/plan-token";
import { canonicalSlug } from "@/lib/copy/slugs";
import { isCopyableFamily } from "@/lib/copy/types";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { readLimitsDefaults } from "@/lib/trade/limits";

export const runtime = "nodejs";

/** §1.8: con el feed vencido o la firma rota la ficha se ve, copiar se apaga. */
const FEED_STALE_MESSAGE =
  "Los datos de Fraccion.si están atrasados: copiar está desactivado por ahora.";

/** §1.5: bajo 40 % de cobertura la cartera no se replica. */
const COVERAGE_MESSAGE = "Esta cartera no se puede replicar bien en Maverlang.";

/**
 * Revisión previa de topes en SÓLO LECTURA (§1.11): se compara cada pierna con
 * el tope por orden vigente y se corta antes de firmar nada. Los topes diario,
 * mensual y global los vuelve a aplicar `/api/trade/quote` en cada orden, que es
 * la pieza autoritativa; acá no se reserva ni se escribe un cupo.
 */
async function assertRealLegLimits(legs: ReadonlyArray<{ symbol: string; usd: number }>): Promise<void> {
  const defaults = await readLimitsDefaults((key) => readFlagValue(key));
  for (const leg of legs) {
    if (leg.usd > defaults.per_order_usd) {
      throw new DomainError(
        "LIMIT_ORDER",
        `La pierna de ${leg.symbol} supera tu tope por orden (US$${defaults.per_order_usd}).`,
      );
    }
  }
}

/**
 * POST /api/copy/plan
 *
 * Arma la mezcla desde el portafolio EN CACHÉ: los pesos nunca llegan del
 * cliente. Devuelve las piernas ya redondeadas (suma exacta) y un `planId`
 * firmado con HMAC-SHA256, atado al usuario, con TTL de 10 minutos.
 *
 * Orden de guardas: Origin → flag de la sección → sesión → rate limit (`trade`)
 * → cuerpo → paywall 402 → doble candado de dinero real → feed → plan.
 */
export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    if (!(await isCopyEnabled())) return copyFeatureDisabled();

    const services = getServices();
    const session = await requireSession(services, req);
    const limited = await withRateLimit(req, "trade", [session.userId]);
    if (limited) return limited;

    const body = await parseJson(req, copyPlanRequestSchema);

    // Paywall (§1.10): sin suscripción no se arma ni una pierna; `past_due`
    // puede mirar, pero no copiar mientras dure la gracia.
    const denied = await copyAccessDenied(session.userId);
    if (denied) return denied;

    // Dinero real (§1.1): flag `copy_buy_enabled` + `COPY_REAL_BUY_READY` +
    // `REAL_TRADING_READY`, todo dentro de `isCopyRealBuyEnabled()`.
    if (body.account === "real" && !(await isCopyRealBuyEnabled())) {
      return copyFeatureDisabled(COPY_REAL_DISABLED, 403);
    }

    const canonical = canonicalSlug(body.slug);
    if (!canonical) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");
    // Fixtures sólo para la cuenta demo (§1.9); a la real se le sirve el feed real.
    const allowFixtures = isUserDemoRequest(req);
    const portfolio = await getCopyPortfolio(canonical, { allowFixtures });
    if (!portfolio) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");

    // La versión que vio la persona tiene que ser la misma que se va a copiar.
    if (portfolio.versionId !== body.versionId) {
      throw new DomainError("QUOTE_EXPIRED", "La cartera cambió. Vuelve a cargar la ficha.");
    }
    // Los datos de ejemplo nunca mueven dinero real (§1.9).
    if (body.account === "real" && portfolio.example) {
      return copyFeatureDisabled("Los datos de ejemplo no se pueden copiar con dinero real.", 403);
    }
    // Familias: 13F y ETF se copian; corredoras CL, AFP y temáticas, no (§1.2).
    if (!isCopyableFamily(portfolio.portfolio.family)) {
      return copyFeatureDisabled("Esta cartera es solo para mirar.", 403);
    }

    const { health } = await getCopyIndex({ allowFixtures });
    if (isCopyFrozenByFeed(health)) return copyFeatureDisabled(FEED_STALE_MESSAGE, 403);

    const plan = await buildCopyPlan({
      portfolio,
      totalUsd: body.totalUsd,
      account: body.account,
      spreadUnavailable: body.spreadUnavailable,
    });

    // Bajo 40 % de cobertura la cartera no se replica (§1.5).
    if (plan.coveragePct < COPY_COVERAGE_MIN_PCT) {
      return copyFeatureDisabled(COVERAGE_MESSAGE, 403);
    }
    // Cobertura suficiente, pero ninguna pierna llega al mínimo de US$1.
    if (plan.legs.length === 0) {
      throw new DomainError("VALIDATION", "El monto es demasiado bajo para armar la mezcla.");
    }
    if (body.account === "real") await assertRealLegLimits(plan.legs);

    // Sin secreto en producción no hay `planId` verificable: 503, no un token débil.
    if (process.env.NODE_ENV === "production" && !process.env.COPY_PLAN_HMAC_SECRET?.trim()) {
      return copyFeatureDisabled("El plan de mezcla no está configurado todavía.", 503);
    }

    const payload: CopyPlanTokenPayload = {
      slug: canonical,
      versionId: portfolio.versionId,
      account: body.account,
      totalUsd: body.totalUsd,
      spreadUnavailable: body.spreadUnavailable,
      coveragePct: plan.coveragePct,
      maxLegs: plan.maxLegs,
      warnings: plan.warnings,
      legs: plan.legs.map((leg) => ({
        symbol: leg.symbol,
        usd: leg.usd,
        weightOriginal: leg.weightOriginal,
        weightMaverlang: leg.weightMaverlang,
      })),
    };
    // El token ES el `planId`: viaja firmado y con el dueño adentro.
    const planId = signPlan(payload, session.userId);

    return {
      ...payload,
      planId,
      unavailableUsd: plan.unavailableUsd,
      expiresAt: new Date(Date.now() + COPY_PLAN_TTL_MS).toISOString(),
      /** Aviso de datos de ejemplo (§1.9) para que el carrito lo muestre. */
      example: portfolio.example,
    };
  });
}
