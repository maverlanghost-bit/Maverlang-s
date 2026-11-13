import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";

import { Coverage } from "@/components/copy/coverage";
import { CopySoonState } from "@/components/copy/empty-states";
import { COPY_FAMILY_LABELS } from "@/components/copy/family-tabs";
import { ExampleDataStrip, FeedBanner } from "@/components/copy/feed-banner";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { LegalNote } from "@/components/copy/legal-note";
import { MovementsList } from "@/components/copy/movements-list";
import { Paywall } from "@/components/copy/paywall";
import { PositionsTable, type PositionRow } from "@/components/copy/positions-table";
import { IconBack } from "@/components/ui/icons";
import { getCopyEntitlement, hasCopyAccess, redactPortfolio } from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { formatFeedDate, lagChip } from "@/lib/copy/lag";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import { canonicalSlug } from "@/lib/copy/slugs";
import { type CopyPortfolio } from "@/lib/copy/types";
import { cn } from "@/lib/cn";
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

/** Rótulo de contexto en mono, separado por un punto: sin cápsulas de color. */
function MetaItem({
  children,
  separator = false,
  tone,
}: {
  children: ReactNode;
  separator?: boolean;
  tone?: "warn" | "down";
}) {
  return (
    <li className="inline-flex min-w-0 items-center gap-3">
      {separator ? <span aria-hidden className="size-[3px] shrink-0 rounded-full bg-border-strong" /> : null}
      <span
        className={cn(
          "inline-flex items-center",
          tone === "warn" && "text-warn",
          tone === "down" && "text-down",
        )}
      >
        {children}
      </span>
    </li>
  );
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
  const ordered = showPositions ? [...visible.positions].sort((a, b) => b.weight - a.weight) : [];

  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(firstValue(query.p), 10);
  const page = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = ordered.slice(start, start + PAGE_SIZE).map((position) => toRow(position, mappedBySymbol));
  const lag = lagChip(meta.asOf, meta.family, meta.isFrozen);
  const lagTone = lag.tone === "amber" ? "warn" : lag.tone === "red" ? "down" : undefined;

  const base = `/app/copiar/${canonical}/posiciones`;
  const hrefFor = (target: number) => (target <= 1 ? base : `${base}?p=${target}`);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-8">
      <Link
        href={`/app/copiar/${canonical}`}
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-1 hover:text-fg"
      >
        <IconBack className="size-4" />
        {meta.name}
      </Link>

      <FeedBanner health={health} />
      {portfolio.example ? <ExampleDataStrip /> : null}

      <header className="flex flex-col gap-3">
        <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
          Posiciones
        </p>
        <h1 className="text-3xl leading-[1.1] tracking-tight text-balance break-words sm:text-4xl">
          {meta.name}
        </h1>
        <p className="text-[15px] leading-6 text-fg-muted">
          {meta.manager}
          {meta.country ? ` · ${meta.country}` : ""}
        </p>
        <ul
          aria-label="Contexto de la cartera"
          className="flex min-w-0 max-w-full list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 font-mono text-[13px] leading-5 tracking-[0.04em] text-fg-muted uppercase"
        >
          <MetaItem>{FAMILY_LABEL[meta.family] ?? meta.family}</MetaItem>
          <MetaItem separator tone={meta.isFrozen ? undefined : lagTone}>
            {meta.isFrozen ? "Cartera congelada" : lag.label}
          </MetaItem>
          {meta.isFrozen ? <MetaItem separator>Dato al {formatFeedDate(meta.asOf)}</MetaItem> : null}
          <MetaItem separator>{showPositions ? `${total} posiciones` : "Composición bloqueada"}</MetaItem>
          {meta.publishedAt ? (
            <MetaItem separator>Publicado el {formatFeedDate(meta.publishedAt)}</MetaItem>
          ) : null}
        </ul>
      </header>

      <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          {showPositions ? (
            <section
              aria-labelledby="posiciones-titulo"
              className="flex flex-col gap-4 border-t border-border pt-8"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2 id="posiciones-titulo" className="text-lg font-medium tracking-tight text-fg">
                  Composición
                </h2>
                {total > 0 ? (
                  <span className="num text-[13px] leading-5 tabular-nums text-fg-muted">
                    {start + 1}–{Math.min(start + PAGE_SIZE, total)} de {total}
                  </span>
                ) : null}
              </div>

              <PositionsTable rows={rows} showMaverlang={hasAccess} />

              {totalPages > 1 ? (
                <nav
                  aria-label="Paginación de posiciones"
                  className="flex items-center justify-between gap-4 border-t border-border/70 pt-4"
                >
                  {page > 1 ? (
                    <Link
                      href={hrefFor(page - 1)}
                      className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline underline-offset-4"
                    >
                      ‹ Anteriores
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="inline-flex min-h-11 items-center text-[13px] text-fg-subtle">
                      ‹ Anteriores
                    </span>
                  )}
                  <span className="num text-[13px] leading-5 tabular-nums text-fg-muted">
                    Página {page} de {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link
                      href={hrefFor(page + 1)}
                      className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline underline-offset-4"
                    >
                      Siguientes ›
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="inline-flex min-h-11 items-center text-[13px] text-fg-subtle">
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
              className="flex flex-col gap-4 border-t border-border pt-8"
            >
              <h2 id="movimientos-titulo" className="text-lg font-medium tracking-tight text-fg">
                Movimientos
              </h2>
              <MovementsList movements={visible.movements} limit={12} />
            </section>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <FraccionSeal />
            <LegalNote disclaimer className="border-0 pt-0" />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-6">
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
