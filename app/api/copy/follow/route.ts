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
  type CopyFollowRow,
} from "@/lib/copy/contracts";
import { getCopyPortfolio } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { canonicalSlug } from "@/lib/copy/slugs";
import type { CopyPortfolio } from "@/lib/copy/types";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "copy_follows";

/** `true` si la tabla todavía no existe (migración 0053 sin aplicar): «Pronto», sin 500. */
function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache|no existe/i.test(message);
}

/** `jsonb` de pesos → mapa símbolo/peso, o `null` si no tiene la forma esperada. */
function weightsOf(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [symbol, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[symbol] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Trigger de la 0053: el tope de 10 carteras que también valida la base. */
function isFollowLimit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
  return /copy_follows_limit|Máximo 10 carteras/i.test(`${message} ${details} ${hint}`);
}

/** Pesos ORIGINALES del portafolio en caché: se guardan para el aviso de cambio. */
function weightsOfPortfolio(portfolio: CopyPortfolio): Record<string, number> {
  const out: Record<string, number> = {};
  for (const position of portfolio.positions) {
    if (position.side === "short") continue;
    out[position.symbol] = position.weight;
  }
  return out;
}

type FollowList = { follows: CopyFollowRow[]; max: number; available: boolean };

/**
 * Carteras seguidas del usuario. Si la tabla no existe o no hay Supabase
 * configurado, la lista queda vacía con `available: false` y la página dice
 * «Pronto» en vez de romperse (§1.12).
 */
async function listFollows(userId: string): Promise<FollowList> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { follows: [], max: COPY_FOLLOW_MAX, available: false };
  }
  const { data, error } = await admin
    .from(TABLE)
    .select("slug,version_id,weights,account,notify,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(COPY_FOLLOW_MAX);
  if (error) {
    if (isMissingTable(error)) return { follows: [], max: COPY_FOLLOW_MAX, available: false };
    throw new DomainError("UPSTREAM", "No pudimos leer tus carteras seguidas.");
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const follows: CopyFollowRow[] = rows
    .map((row) => ({
      slug: String(row.slug ?? ""),
      versionId: String(row.version_id ?? ""),
      weights: weightsOf(row.weights),
      account: row.account === "real" ? ("real" as const) : ("demo" as const),
      notify: row.notify !== false,
      createdAt: String(row.created_at ?? ""),
    }))
    .filter((row) => row.slug !== "" && row.versionId !== "");
  return { follows, max: COPY_FOLLOW_MAX, available: true };
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
    return readOutput(copyFollowsResponseSchema, await listFollows(session.userId));
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

    const current = await listFollows(session.userId);
    const already = current.follows.some((row) => row.slug === canonical);
    if (!already && current.follows.length >= COPY_FOLLOW_MAX) {
      throw new DomainError(
        "LIMIT_ORDER",
        `Puedes seguir hasta ${COPY_FOLLOW_MAX} carteras. Deja de seguir una para agregar otra.`,
      );
    }

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      return copyFeatureDisabled("Copiar carteras todavía no está disponible.", 503);
    }

    const row = {
      version_id: portfolio.versionId,
      weights: weightsOfPortfolio(portfolio),
      account: body.account ?? "demo",
      notify: body.notify ?? true,
    };
    const writeError = already
      ? (await admin.from(TABLE).update(row).eq("user_id", session.userId).eq("slug", canonical))
          .error
      : (await admin.from(TABLE).insert({ user_id: session.userId, slug: canonical, ...row })).error;
    if (writeError) {
      if (isMissingTable(writeError)) {
        return copyFeatureDisabled("Copiar carteras todavía no está disponible.", 503);
      }
      if (isFollowLimit(writeError)) {
        throw new DomainError(
          "LIMIT_ORDER",
          `Puedes seguir hasta ${COPY_FOLLOW_MAX} carteras. Deja de seguir una para agregar otra.`,
        );
      }
      throw new DomainError("UPSTREAM", "No pudimos guardar esa cartera.");
    }

    return readOutput(copyFollowsResponseSchema, await listFollows(session.userId));
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

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      return copyFeatureDisabled("Copiar carteras todavía no está disponible.", 503);
    }
    const { error } = await admin
      .from(TABLE)
      .delete()
      .eq("user_id", session.userId)
      .eq("slug", canonical);
    if (error) {
      if (isMissingTable(error)) {
        return copyFeatureDisabled("Copiar carteras todavía no está disponible.", 503);
      }
      throw new DomainError("UPSTREAM", "No pudimos actualizar tus carteras.");
    }
    return readOutput(copyFollowsResponseSchema, await listFollows(session.userId));
  });
}
