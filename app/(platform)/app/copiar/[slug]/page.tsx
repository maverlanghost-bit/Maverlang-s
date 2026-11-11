import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { Coverage, COVERAGE_COPY_MIN } from "@/components/copy/coverage";
import { CopySoonState } from "@/components/copy/empty-states";
import { COPY_FAMILY_LABELS } from "@/components/copy/family-tabs";
import { ExampleDataStrip, FeedBanner } from "@/components/copy/feed-banner";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { LagStrip } from "@/components/copy/lag-strip";
import { LegalNote } from "@/components/copy/legal-note";
import { MovementsList } from "@/components/copy/movements-list";
import { Paywall } from "@/components/copy/paywall";
import { PositionsTable, type PositionRow } from "@/components/copy/positions-table";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { COPY_CTA_NOTE } from "@/content/copy-legal";
import {
  COPY_PAST_DUE_MESSAGE,
  getCopyEntitlement,
  hasCopyAccess,
  isCopyReadOnly,
  redactPortfolio,
} from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio, isCopyFrozenByFeed } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { lagChip } from "@/lib/copy/lag";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import { estimatePerformance } from "@/lib/copy/perf";
import { canonicalSlug } from "@/lib/copy/slugs";
import { isCopyableFamily, type CopyFamily, type CopyPortfolio } from "@/lib/copy/types";
import { formatPortion } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** El gráfico es un SVG propio, sin librerías, y entra con `next/dynamic`. */
const PerfChart = nextDynamic(() => import("@/components/copy/perf-chart").then((module) => module.PerfChart), {
  loading: () => <div aria-hidden className="h-40 w-full animate-pulse rounded-2xl bg-surface-3 sm:h-48" />,
});

/** Depende de flags, del feed y del acceso: nunca se prerenderiza. */
export const dynamic = "force-dynamic";

const FAMILY_LABEL = COPY_FAMILY_LABELS;

/** Solo estas familias pueden aparecer en una ficha pública de Copiar. */
const VIEWABLE_FAMILIES: readonly string[] = ["13f", "etf", "broker_cl", "afp", "thematic"];

const FAMILY_REASON: Partial<Record<CopyFamily, string>> = {
  broker_cl:
    "Solo para mirar: la cartera de una corredora chilena se muestra para consulta, pero no se puede copiar en Maverlang.",
  afp: "Solo para mirar: la cartera de una AFP se muestra para consulta, pero no se puede copiar en Maverlang.",
  thematic:
    "Solo para mirar: las carteras temáticas se muestran para consulta, pero no se pueden copiar en Maverlang.",
};

type Mapped = Awaited<ReturnType<typeof mapPositions>>[number];

/** Id del usuario de la sesión; "" cuando no hay (modo demo sin Supabase). */
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

/**
 * La curva se calcula con el historial propio de Maverlang y se transmite
 * aparte: la ficha no espera a la lectura de precios para pintar.
 */
async function PerfSection({
  portfolio,
  mapped,
}: {
  portfolio: CopyPortfolio;
  mapped: readonly Mapped[];
}) {
  let perf: Awaited<ReturnType<typeof estimatePerformance>> = null;
  try {
    // Se reusa el mapeo ya calculado: no se vuelve a resolver el catálogo.
    perf = await estimatePerformance(portfolio, "1Y", { mapped });
  } catch {
    // Sin historial propio no se inventa una serie.
    perf = null;
  }

  if (!perf || perf.points.length < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">
        Sin historial de precios de Maverlang para esta cartera.
      </p>
    );
  }
  return <PerfChart points={perf.points} />;
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
    title: `${portfolio.portfolio.name} · Copiar carteras`,
    description: `Cartera de ${portfolio.portfolio.manager} según Fraccion.si: fecha del dato, atraso, cobertura y movimientos.`,
    robots: { index: false, follow: false },
  };
}

export default async function CopyPortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!(await isCopyEnabled())) return <CopySoonState />;

  // Alias → canónico con 308. Un demo oculto de familia excluida no tiene
  // canónico y termina en 404.
  const canonical = canonicalSlug(slug) ?? slug.toLowerCase();
  if (canonical !== slug) permanentRedirect(`/app/copiar/${canonical}`);

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
  // `past_due`: 3 días de gracia SOLO lectura (§1.10).
  const readOnly = isCopyReadOnly(entitlement);
  // El paywall se aplica en el servidor: sin acceso no se serializa la composición.
  const visible = redactPortfolio(portfolio, hasAccess);

  const familyCopyable = isCopyableFamily(meta.family);
  const feedDead = isCopyFrozenByFeed(health);
  const lag = lagChip(meta.asOf, meta.family, meta.isFrozen);
  const lagTone = lag.tone === "neutral" ? "neutral" : lag.tone === "amber" ? "warn" : "down";
  const topFifty = meta.coverage === "top50_of_full_book";

  const blockReason = !familyCopyable
    ? (FAMILY_REASON[meta.family] ?? "Esta cartera es solo para mirar.")
    : meta.isFrozen
      ? "Cartera congelada: el gestor dejó de declarar, así que no hay una cartera vigente que copiar."
      : coveragePct < COVERAGE_COPY_MIN
        ? `Esta cartera no se puede replicar bien en Maverlang: la cobertura es ${formatPortion(coveragePct / 100)} y el mínimo para copiar es ${COVERAGE_COPY_MIN} %.`
        : feedDead
          ? "Los datos del feed están vencidos o no se pudieron verificar. Copiar queda desactivado hasta que se actualicen."
          : readOnly
            ? COPY_PAST_DUE_MESSAGE
            : null;

  const canCopy = hasAccess && blockReason === null;
  const showPositions = hasAccess || meta.family === "broker_cl";

  const mappedBySymbol = new Map<string, Mapped>(mapped.map((position) => [position.symbol, position]));
  const ordered = showPositions ? [...visible.positions].sort((a, b) => b.weight - a.weight) : [];
  const top = ordered.slice(0, 10);
  const topWeight = top.reduce((sum, position) => sum + position.weight, 0);
  const topRows = top.map((position) => toRow(position, mappedBySymbol));
  const available = mapped.filter((position) => position.status === "available").length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/app/copiar"
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Copiar carteras
        </Link>
        <FraccionSeal />
      </div>

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
          {topFifty ? <Badge tone="neutral">Top 50 del libro</Badge> : null}
          {!familyCopyable ? <Badge tone="neutral">Solo para mirar</Badge> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{meta.name}</h1>
        <p className="text-sm text-fg-muted">
          {meta.manager}
          {meta.country ? ` · ${meta.country}` : ""}
        </p>
        <LagStrip
          asOf={meta.asOf}
          filedAt={meta.filedAt}
          publishedAt={meta.publishedAt}
          generatedAt={portfolio.generatedAt}
          lagNote={meta.lagNote}
        />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="grafico-titulo"
            className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5 md:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="grafico-titulo" className="text-base font-medium text-fg">
                Evolución estimada
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                Último año
              </span>
            </div>
            <Suspense
              fallback={
                <div aria-hidden className="h-40 w-full animate-pulse rounded-2xl bg-surface-3 sm:h-48" />
              }
            >
              <PerfSection portfolio={portfolio} mapped={mapped} />
            </Suspense>
          </section>

          {showPositions ? (
            <section
              aria-labelledby="posiciones-titulo"
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5 md:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="posiciones-titulo" className="text-base font-medium text-fg">
                  Top 10 posiciones
                </h2>
                {top.length > 0 ? (
                  <span className="font-mono text-xs tabular-nums text-fg-muted">
                    Top 10 = {formatPortion(topWeight / 100)} del portafolio
                  </span>
                ) : null}
              </div>

              {topRows.length > 0 ? (
                <>
                  <PositionsTable rows={topRows} showMaverlang={hasAccess} />
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Link
                      href={`/app/copiar/${canonical}/posiciones`}
                      className="text-sm font-medium text-fg underline underline-offset-4"
                    >
                      Ver las {visible.positions.length} posiciones
                    </Link>
                    {visible.positions.length > top.length ? (
                      <span className="font-mono text-xs tabular-nums text-fg-muted">
                        {top.length} de {visible.positions.length}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-fg-muted">
                  Esta cartera no tiene posiciones publicadas.
                </p>
              )}
            </section>
          ) : (
            <Paywall />
          )}

          {showPositions ? (
            <section
              aria-labelledby="movimientos-titulo"
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5 md:p-6"
            >
              <h2 id="movimientos-titulo" className="text-base font-medium text-fg">
                Movimientos
              </h2>
              <MovementsList movements={visible.movements} limit={8} />
            </section>
          ) : null}

          <LegalNote />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <Coverage
            coveragePct={coveragePct}
            mappedCount={available}
            totalCount={mapped.length}
          />

          <section
            aria-labelledby="cta-titulo"
            className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-5"
          >
            <h2
              id="cta-titulo"
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted"
            >
              Copiar esta cartera
            </h2>

            {canCopy ? (
              <>
                <Link
                  href={`/app/copiar/${canonical}/mezcla`}
                  className={buttonClasses({ variant: "primary", size: "lg" })}
                >
                  Copiar esta mezcla
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  className={buttonClasses({ variant: "secondary", size: "lg" })}
                >
                  Copiar esta mezcla
                </button>
                <p className="text-sm leading-relaxed text-fg-body">
                  {blockReason ?? "Necesitas el plan Copiar carteras para replicar la mezcla."}
                </p>
                {familyCopyable && (!hasAccess || readOnly) ? (
                  <Link
                    href="/app/copiar/planes"
                    className="text-sm font-medium text-fg underline underline-offset-4"
                  >
                    Ver planes
                  </Link>
                ) : null}
              </>
            )}

            <p className="text-xs leading-relaxed text-fg-muted">{COPY_CTA_NOTE}</p>
            <p className="text-xs leading-relaxed text-fg-subtle">
              {meta.isEstimated ? "Composición estimada por Fraccion.si. " : ""}
              Compra y venta sujetas a disponibilidad y topes de tu cuenta.
            </p>
          </section>

          <p className="text-xs leading-relaxed text-fg-muted">
            Atribución: {meta.attribution}
            {meta.license ? ` · ${meta.license}` : ""}
          </p>
        </aside>
      </div>
    </div>
  );
}
