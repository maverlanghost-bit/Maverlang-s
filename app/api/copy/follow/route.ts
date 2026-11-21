import {
  assertSameOrigin,
  handle,
  isUserDemoRequest,
  parseJson,
  parseQuery,
  readOutput,
  requireSession,
} from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import {
  COPY_FOLLOW_MAX,
  copyAccessDenied,
  copyFeatureDisabled,
  copyFollowDeleteQuerySchema,
  copyFollowRequestSchema,
  copyFollowsResponseSchema,
} from "@/lib/copy/contracts";
import { getCopyPortfolio } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { canonicalSlug } from "@/lib/copy/slugs";
import type { CopyPortfolio } from "@/lib/copy/types";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import {
  deleteUserCopyFollow,
  listUserCopyFollows,
  upsertUserCopyFollow,
} from "@/lib/services/copy.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pesos ORIGINALES del portafolio en caché: se guardan para el aviso de cambio. */
function weightsOfPortfolio(portfolio: CopyPortfolio): Record<string, number> {
  const out: Record<string, number> = {};
  for (const position of portfolio.positions) {
    if (position.side === "short") continue;
    out[position.symbol] = position.weight;
  }
  return out;
}

/** GET /api/copy/follow: carteras seguidas (máx. 10), siempre con el slug canónico. */
export function GET(req: Request) {
  return handle("private", async () => {
    if (!(await isCopyEnabled())) return copyFeatureDisabled();
    const services = getServices();
    const session = await requireSession(services, req);
    const limited = await withRateLimit(req, "me", [session.userId]);
    if (limited) return limited;
    // `past_due` puede leer sus carteras durante la gracia.
    const denied = await copyAccessDenied(session.userId, "read");
    if (denied) return denied;
    return readOutput(copyFollowsResponseSchema, await listUserCopyFollows(session.userId));
  });
}

/**
 * POST /api/copy/follow { slug, account?, notify? }
 * Guarda el slug CANÓNICO y la versión y los pesos que salen del portafolio en
 * caché (nunca del cliente). Al llegar a 10 se rechaza con 422 `LIMIT_ORDER`.
 */
export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    if (!(await isCopyEnabled())) return copyFeatureDisabled();
    const services = getServices();
    const session = await requireSession(services, req);
    const limited = await withRateLimit(req, "me", [session.userId]);
    if (limited) return limited;
    const body = await parseJson(req, copyFollowRequestSchema);
    const denied = await copyAccessDenied(session.userId);
    if (denied) return denied;

    const canonical = canonicalSlug(body.slug);
    if (!canonical) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");
    const portfolio = await getCopyPortfolio(canonical, {
      allowFixtures: isUserDemoRequest(req),
    });
    if (!portfolio) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");

    const current = await listUserCopyFollows(session.userId);
    const already = current.follows.some((row) => row.slug === canonical);
    if (!already && current.follows.length >= COPY_FOLLOW_MAX) {
      throw new DomainError(
        "LIMIT_ORDER",
        `Puedes seguir hasta ${COPY_FOLLOW_MAX} carteras. Deja de seguir una para agregar otra.`,
      );
    }

    const saved = await upsertUserCopyFollow({
      userId: session.userId,
      slug: canonical,
      versionId: portfolio.versionId,
      weights: weightsOfPortfolio(portfolio),
      account: body.account ?? "demo",
      notify: body.notify ?? true,
      already,
    });
    if (!saved.ok) {
      return copyFeatureDisabled("Copiar carteras todavía no está disponible.", 503);
    }

    return readOutput(copyFollowsResponseSchema, await listUserCopyFollows(session.userId));
  });
}

/** DELETE /api/copy/follow?slug=… : deja de seguir (idempotente). */
export function DELETE(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    if (!(await isCopyEnabled())) return copyFeatureDisabled();
    const services = getServices();
    const session = await requireSession(services, req);
    const limited = await withRateLimit(req, "me", [session.userId]);
    if (limited) return limited;
    const { slug } = parseQuery(req, copyFollowDeleteQuerySchema);
    const denied = await copyAccessDenied(session.userId);
    if (denied) return denied;

    const canonical = canonicalSlug(slug);
    if (!canonical) throw new DomainError("NOT_FOUND", "No encontramos esa cartera.");

    const removed = await deleteUserCopyFollow({
      userId: session.userId,
      slug: canonical,
    });
    if (!removed.ok) {
      return copyFeatureDisabled("Copiar carteras todavía no está disponible.", 503);
    }
    return readOutput(copyFollowsResponseSchema, await listUserCopyFollows(session.userId));
  });
}
