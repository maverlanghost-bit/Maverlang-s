import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { Coverage, COVERAGE_COPY_MIN } from "@/components/copy/coverage";
import { CopySoonState } from "@/components/copy/empty-states";
import { COPY_FAMILY_LABELS } from "@/components/copy/family-tabs";
import { ExampleDataStrip, FeedBanner } from "@/components/copy/feed-banner";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { LagStrip } from "@/components/copy/lag-strip";
import { MovementsList } from "@/components/copy/movements-list";
import { Paywall } from "@/components/copy/paywall";
import { PositionsTable, type PositionRow } from "@/components/copy/positions-table";
import { buttonClasses } from "@/components/ui/button";
import { IconBack } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { COPY_CTA_NOTE, COPY_DISCLAIMER, COPY_LEGAL_PENDING_LABEL } from "@/content/copy-legal";
import {
  COPY_PAST_DUE_MESSAGE,
  getCopyEntitlement,
  hasCopyAccess,
  isCopyReadOnly,
  redactPortfolio,
} from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio, isCopyFrozenByFeed } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { formatFeedDate, lagChip } from "@/lib/copy/lag";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import { estimatePerformance } from "@/lib/copy/perf";
import { canonicalSlug } from "@/lib/copy/slugs";
import {
  isCopyableFamily,
  type CopyFamily,
  type CopyPortfolio,
  type CopyPortfolioMeta,
} from "@/lib/copy/types";
import { cn } from "@/lib/cn";
import { formatPortion } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** El gráfico es un SVG propio, sin librerías, y entra con `next/dynamic`. */
const PerfChart = nextDynamic(() => import("@/components/copy/perf-chart").then((module) => module.PerfChart), {
  loading: () => <PerfSkeleton />,
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

/** Qué respalda el dato. Se dice con palabras, nunca con un sello de color. */
const VERIFICATION_LABEL: Record<CopyPortfolioMeta["verification"], string> = {
  official_filing: "Declaración oficial",
  human_reviewed: "Revisión humana",
  editorial_model: "Modelo editorial",
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

/** Fila de dato con hairline: rótulo a la izquierda, valor a la derecha. */
function DataRow({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="min-w-0 flex-1 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[13px] leading-5 font-medium text-fg",
          mono ? "num shrink-0 whitespace-nowrap tabular-nums" : "font-sans",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function PerfSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-4 w-52 max-w-full" />
      <Skeleton className="h-40 w-full sm:h-44" />
    </div>
  );
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
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Sin historial de precios de Maverlang para esta cartera. No dibujamos una curva con datos que no
        tenemos.
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
  const lagTone = lag.tone === "amber" ? "warn" : lag.tone === "red" ? "down" : undefined;
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
  /** Lo que se resuelve en planes: sin suscripción o con el pago atrasado. */
  const planCanUnblock =
    familyCopyable &&
    !meta.isFrozen &&
    !feedDead &&
    coveragePct >= COVERAGE_COPY_MIN &&
    (!hasAccess || readOnly);
  const ctaReason =
    blockReason ?? (hasAccess ? null : "Necesitas el plan Copiar carteras para replicar la mezcla.");
  const showPositions = hasAccess || meta.family === "broker_cl";

  const mappedBySymbol = new Map<string, Mapped>(mapped.map((position) => [position.symbol, position]));
  const ordered = showPositions ? [...visible.positions].sort((a, b) => b.weight - a.weight) : [];
  const top = ordered.slice(0, 10);
  const topWeight = top.reduce((sum, position) => sum + position.weight, 0);
  const topRows = top.map((position) => toRow(position, mappedBySymbol));
  const available = mapped.filter((position) => position.status === "available").length;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/app/copiar"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-1 hover:text-fg"
        >
          <IconBack className="size-4" />
          Copiar carteras
        </Link>
      </div>

      <FeedBanner health={health} />
      {portfolio.example ? <ExampleDataStrip /> : null}

      <header className="flex flex-col gap-3">
        <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
          {FAMILY_LABEL[meta.family] ?? meta.family}
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
          <MetaItem tone={meta.isFrozen ? undefined : lagTone}>
            {meta.isFrozen ? "Cartera congelada" : lag.label}
          </MetaItem>
          {meta.isFrozen ? <MetaItem separator>Dato al {formatFeedDate(meta.asOf)}</MetaItem> : null}
          {topFifty ? <MetaItem separator>Top 50 del libro</MetaItem> : null}
          {!familyCopyable ? <MetaItem separator>Solo para mirar</MetaItem> : null}
          <MetaItem separator>{VERIFICATION_LABEL[meta.verification]}</MetaItem>
        </ul>
        <LagStrip
          filedAt={meta.filedAt}
          publishedAt={meta.publishedAt}
          generatedAt={portfolio.generatedAt}
          lagNote={meta.lagNote}
        />
      </header>

      <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 flex min-w-0 flex-col gap-10 lg:order-1">
          <section
            aria-labelledby="rendimiento-titulo"
            className="flex flex-col gap-4 border-t border-border pt-8"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="rendimiento-titulo" className="text-lg font-medium tracking-tight text-fg">
                Rendimiento
              </h2>
              <span className="font-mono text-[13px] leading-5 tracking-[0.045em] text-fg-muted uppercase">
                Estimado · 12 meses
              </span>
            </div>
            <Suspense fallback={<PerfSkeleton />}>
              <PerfSection portfolio={portfolio} mapped={mapped} />
            </Suspense>
          </section>

          {showPositions ? (
            <section
              aria-labelledby="composicion-titulo"
              className="flex flex-col gap-4 border-t border-border pt-8"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2 id="composicion-titulo" className="text-lg font-medium tracking-tight text-fg">
                  Composición
                </h2>
                {top.length > 0 ? (
                  <span className="num text-[13px] leading-5 tabular-nums text-fg-muted">
                    {top.length} de {visible.positions.length} · {formatPortion(topWeight / 100)} del portafolio
                  </span>
                ) : null}
              </div>

              <PositionsTable rows={topRows} showMaverlang={hasAccess} />

              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                {visible.positions.length > 0 ? (
                  <Link
                    href={`/app/copiar/${canonical}/posiciones`}
                    className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline underline-offset-4 hover:text-fg-body"
                  >
                    Ver las {visible.positions.length} posiciones
                  </Link>
                ) : null}
                {familyCopyable && top.length > 0 ? (
                  <Link
                    href={`/app/copiar/${canonical}/mezcla`}
                    className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg-muted underline underline-offset-4 hover:text-fg"
                  >
                    Ver la mezcla
                  </Link>
                ) : null}
              </div>
            </section>
          ) : (
            <Paywall compact title="Desbloquea la composición" />
          )}

          {showPositions ? (
            <section
              aria-labelledby="movimientos-titulo"
              className="flex flex-col gap-4 border-t border-border pt-8"
            >
              <h2 id="movimientos-titulo" className="text-lg font-medium tracking-tight text-fg">
                Movimientos
              </h2>
              <MovementsList movements={visible.movements} limit={8} />
            </section>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-border pt-6">
            <FraccionSeal />
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Atribución: {meta.attribution}
              {meta.license ? ` · ${meta.license}` : ""}
            </p>
            <p className="text-[13px] leading-relaxed text-fg-body">{COPY_DISCLAIMER}</p>
            <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_LEGAL_PENDING_LABEL}</p>
          </div>
        </div>

        <aside className="order-1 flex min-w-0 flex-col gap-4 lg:order-2 lg:sticky lg:top-6">
          <section
            aria-labelledby="cta-titulo"
            className="flex flex-col gap-4 rounded-3xl border border-border bg-bg p-5"
          >
            <h2 id="cta-titulo" className="text-lg font-medium tracking-tight text-fg">
              Copiar esta cartera
            </h2>

            <Coverage
              coveragePct={coveragePct}
              mappedCount={available}
              totalCount={mapped.length}
              className="border-t border-border/70 pt-4"
            />

            <dl className="border-t border-border/70 pt-1">
              <DataRow label="Composición" mono={false}>
                {meta.isEstimated ? "Estimada" : "Declarada"}
              </DataRow>
            </dl>

            {ctaReason ? (
              <p className="text-[13px] leading-relaxed text-fg-body">{ctaReason}</p>
            ) : null}

            {canCopy ? (
              <Link
                href={`/app/copiar/${canonical}/mezcla`}
                className={buttonClasses({ variant: "primary", size: "lg", className: "min-h-12 w-full" })}
              >
                Copiar esta mezcla
              </Link>
            ) : planCanUnblock ? (
              <Link
                href="/app/copiar/planes"
                className={buttonClasses({ variant: "primary", size: "lg", className: "min-h-12 w-full" })}
              >
                Ver planes
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={buttonClasses({ variant: "secondary", size: "lg", className: "min-h-12 w-full" })}
              >
                Copiar esta mezcla
              </button>
            )}

            <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_CTA_NOTE}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
