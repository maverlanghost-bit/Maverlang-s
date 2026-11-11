import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { Coverage, formatWeightPct } from "@/components/copy/coverage";
import { CopySoonState } from "@/components/copy/empty-states";
import { COPY_FAMILY_LABELS } from "@/components/copy/family-tabs";
import { ExampleDataStrip, FeedBanner } from "@/components/copy/feed-banner";
import { LegalNote } from "@/components/copy/legal-note";
import { MovementsList } from "@/components/copy/movements-list";
import { Paywall } from "@/components/copy/paywall";
import { PositionsTable, type PositionRow } from "@/components/copy/positions-table";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getCopyEntitlement, hasCopyAccess, redactPortfolio } from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { formatFeedDate, lagChip } from "@/lib/copy/lag";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import { canonicalSlug } from "@/lib/copy/slugs";
import { type CopyPortfolio } from "@/lib/copy/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Depende de flags, del feed y del acceso: nunca se prerenderiza. */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Mapped = Awaited<ReturnType<typeof mapPositions>>[number];

const FAMILY_LABEL = COPY_FAMILY_LABELS;

const VIEWABLE_FAMILIES: readonly string[] = ["13f", "etf", "broker_cl", "afp", "thematic"];

async function readViewerId(): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return "";
    // `getClaims` valida el JWT (JWKS en caché); no hace un viaje extra a Auth.
    const { data, error } = await supabase.auth.getClaims();
    const sub: unknown = data?.claims?.sub;
    return !error && typeof sub === "string" ? sub : "";
  } catch {
    return "";
  }
}

function toRow(
  position: CopyPortfolio["positions"][number],
  mapped: ReadonlyMap<string, Mapped>,
): PositionRow {
  const mappedPosition = mapped.get(position.symbol);
  return {
    symbol: position.symbol,
    name: position.name,
    tradableSymbol: mappedPosition?.tradableSymbol ?? null,
    status: mappedPosition?.status ?? "review",
    reason: mappedPosition?.reason ?? null,
    weightOriginal: mappedPosition?.weightOriginal ?? position.weight,
    weightMaverlang: mappedPosition?.weightMaverlang ?? 0,
  };
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = canonicalSlug(slug) ?? slug.toLowerCase();
  const portfolio = await getCopyPortfolio(canonical);
  if (!portfolio) return { title: "Cartera no encontrada" };
  return {
    title: `Posiciones · ${portfolio.portfolio.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function CopyPositionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  if (!(await isCopyEnabled())) return <CopySoonState />;

  const canonical = canonicalSlug(slug) ?? slug.toLowerCase();
  if (canonical !== slug) permanentRedirect(`/app/copiar/${canonical}/posiciones`);

  const { health } = await getCopyIndex();
  if (health.state === "none") return <CopySoonState />;

  const portfolio = await getCopyPortfolio(canonical);
  if (!portfolio) notFound();
  const meta = portfolio.portfolio;
  if (!VIEWABLE_FAMILIES.includes(meta.family)) notFound();

  const [mapped, viewerId] = await Promise.all([
    mapPositions(portfolio.positions, { family: meta.family }),
    readViewerId(),
  ]);
  const coveragePct = coverageOf(mapped);
  const entitlement = viewerId ? await getCopyEntitlement(viewerId) : "none";
  const hasAccess = hasCopyAccess(entitlement);
  const visible = redactPortfolio(portfolio, hasAccess);

  const showPositions = hasAccess || meta.family === "broker_cl";
  const mappedBySymbol = new Map<string, Mapped>(mapped.map((position) => [position.symbol, position]));
  const ordered = showPositions ? [...visible.positions] : [];

  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(firstValue(query.p), 10);
  const page = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = ordered.slice(start, start + PAGE_SIZE).map((position) => toRow(position, mappedBySymbol));
  const lag = lagChip(meta.asOf, meta.family, meta.isFrozen);
  const lagTone = lag.tone === "neutral" ? "neutral" : lag.tone === "amber" ? "warn" : "down";

  const base = `/app/copiar/${canonical}/posiciones`;
  const hrefFor = (target: number) => (target <= 1 ? base : `${base}?p=${target}`);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link
        href={`/app/copiar/${canonical}`}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <span aria-hidden>←</span> {meta.name}
      </Link>

      <FeedBanner health={health} />
      {portfolio.example ? <ExampleDataStrip /> : null}

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{FAMILY_LABEL[meta.family] ?? meta.family}</Badge>
          {meta.isFrozen ? (
            <Badge tone="warn">Cartera congelada</Badge>
          ) : (
            <Badge tone={lagTone}>{lag.label}</Badge>
          )}
          <Badge tone="neutral">
            {showPositions ? `${total} posiciones` : "Composición bloqueada"}
          </Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Posiciones de {meta.name}
        </h1>
        <p className="text-sm text-fg-muted">
          Dato al {formatFeedDate(meta.asOf)}
          {meta.publishedAt ? ` · Publicado ${formatFeedDate(meta.publishedAt)}` : ""}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {showPositions ? (
            <section
              aria-labelledby="posiciones-titulo"
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5 md:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="posiciones-titulo" className="text-base font-medium text-fg">
                  {total > PAGE_SIZE
                    ? `Posiciones ${start + 1}–${Math.min(start + PAGE_SIZE, total)}`
                    : "Todas las posiciones"}
                </h2>
                <span className="font-mono text-xs tabular-nums text-fg-muted">
                  Cobertura {formatWeightPct(coveragePct)}
                </span>
              </div>

              {rows.length > 0 ? (
                <PositionsTable rows={rows} showMaverlang={hasAccess} />
              ) : (
                <p className="text-sm leading-relaxed text-fg-muted">
                  Esta cartera no tiene posiciones publicadas.
                </p>
              )}

              {totalPages > 1 ? (
                <nav
                  aria-label="Paginación de posiciones"
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4"
                >
                  {page > 1 ? (
                    <Link href={hrefFor(page - 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      ‹ Anteriores
                    </Link>
                  ) : (
                    <span className={buttonClasses({ variant: "secondary", size: "sm", className: "pointer-events-none opacity-40" })} aria-disabled="true">
                      ‹ Anteriores
                    </span>
                  )}
                  <span className="font-mono text-xs tabular-nums text-fg-muted">
                    Página {page} de {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link href={hrefFor(page + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      Siguientes ›
                    </Link>
                  ) : (
                    <span className={buttonClasses({ variant: "secondary", size: "sm", className: "pointer-events-none opacity-40" })} aria-disabled="true">
                      Siguientes ›
                    </span>
                  )}
                </nav>
              ) : null}
            </section>
          ) : (
            <Paywall
              title="Desbloquea las posiciones"
              description="Con Copiar carteras ves la composición completa, los movimientos y puedes replicar la mezcla en tu cuenta."
            />
          )}

          {showPositions ? (
            <section
              aria-labelledby="movimientos-titulo"
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5 md:p-6"
            >
              <h2 id="movimientos-titulo" className="text-base font-medium text-fg">
                Movimientos
              </h2>
              <MovementsList movements={visible.movements} limit={12} />
            </section>
          ) : null}

          <LegalNote />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <Coverage
            coveragePct={coveragePct}
            mappedCount={mapped.filter((position) => position.status === "available").length}
            totalCount={mapped.length}
          />
        </aside>
      </div>
    </div>
  );
}
