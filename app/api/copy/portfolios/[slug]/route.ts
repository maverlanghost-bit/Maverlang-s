import { NextResponse } from "next/server";

import { parseContract } from "@/lib/api/contracts";
import { handle, isUserDemoRequest } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { getCopyEntitlement, hasCopyAccess, redactPortfolio } from "@/lib/copy/access";
import {
  copyFeatureDisabled,
  copyPortfolioParamsSchema,
} from "@/lib/copy/contracts";
import { getCopyIndex, getCopyPortfolio, isCopyFrozenByFeed } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { canonicalSlug, isAlias } from "@/lib/copy/slugs";
import { isCopyableFamily } from "@/lib/copy/types";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/copy/portfolios/[slug]
 *
 * - alias → 308 al slug canónico (§1.7), nunca se sirve la composición de un alias;
 * - `redactPortfolio` aplica el paywall en el servidor (§1.10): sin acceso no se
 *   serializan posiciones ni movimientos, salvo `broker_cl` (muro de Fraccion.si);
 * - `Cache-Control: private, no-store` siempre que haya composición: la respuesta
 *   depende de quién pregunta y no puede quedar en una caché compartida.
 */
export function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle("private", async () => {
    if (!(await isCopyEnabled())) return copyFeatureDisabled();
    const params = parseContract(copyPortfolioParamsSchema, await ctx.params);
    const canonical = canonicalSlug(params.slug);
    if (!canonical) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");
    if (isAlias(params.slug)) {
      return NextResponse.redirect(new URL(`/api/copy/portfolios/${canonical}`, req.url), 308);
    }

    const services = getServices();
    const session = await services.auth.getSession(req);
    const limited = await withRateLimit(req, "me", session ? [session.userId] : []);
    if (limited) return limited;

    // Fixtures sólo para la cuenta demo (§1.9); a la real se le sirve el feed real.
    const allowFixtures = isUserDemoRequest(req);
    const portfolio = await getCopyPortfolio(canonical, { allowFixtures });
    if (!portfolio) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");

    const access = session ? hasCopyAccess(await getCopyEntitlement(session.userId)) : false;
    const redacted = redactPortfolio(portfolio, access);
    const { health } = await getCopyIndex({ allowFixtures });
    const copyable = isCopyableFamily(redacted.portfolio.family) && !isCopyFrozenByFeed(health);
    return { portfolio: redacted, health, copyable, hasAccess: access };
  });
}
