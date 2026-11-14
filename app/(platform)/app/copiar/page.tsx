import type { Metadata } from "next";
import Link from "next/link";

import {
  CopyFeedUnavailable,
  CopyNoResults,
  CopySoonState,
} from "@/components/copy/empty-states";
import {
  COPY_FAMILY_LABELS,
  FamilyTabs,
  type FamilyTabItem,
} from "@/components/copy/family-tabs";
import { ExampleDataStrip, FeedBanner } from "@/components/copy/feed-banner";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { LegalNote } from "@/components/copy/legal-note";
import { PortfolioCard, PORTFOLIO_HEADER_GRID } from "@/components/copy/portfolio-card";
import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { buttonClasses } from "@/components/ui/button";
import { IconSearch } from "@/components/ui/icons";
import { getCopyIndex, getCopyPortfolio } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { daysSince, lagChip, type LagChip } from "@/lib/copy/lag";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import {
  COPY_FAMILIES,
  isCopyFamily,
  type CopyFamily,
  type CopyIndexEntry,
  type FeedHealth,
} from "@/lib/copy/types";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Copiar carteras",
  description:
    "Carteras 13F y ETF, corredoras chilenas, AFP y temáticas. Fecha del dato, atraso y cobertura calculada con el catálogo de Maverlang.",
};

type CatalogOrder = "cobertura" | "atraso" | "nombre";

type Row = {
  entry: CopyIndexEntry;
  lag: LagChip;
  lagDays: number | null;
  coveragePct: number | null;
};

const ORDERS: readonly { value: CatalogOrder; label: string; title: string }[] = [
  { value: "cobertura", label: "Cobertura", title: "Mayor cobertura en Maverlang primero" },
  { value: "atraso", label: "Atraso", title: "Dato más reciente primero" },
  { value: "nombre", label: "Nombre", title: "Orden alfabético" },
];

const NO_FEED: FeedHealth = {
  state: "invalid",
  generatedAt: null,
  status: null,
  source: "remote",
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function catalogHref(state: {
  q: string;
  family: CopyFamily | "all";
  order: CatalogOrder;
}): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.family !== "all") params.set("familia", state.family);
  if (state.order !== "cobertura") params.set("orden", state.order);
  const search = params.toString();
  return search ? `/app/copiar?${search}` : "/app/copiar";
}

const HEADER_CELL = "label-xs";

/**
 * Portada del hub: H1, una línea de alcance y una sola CTA primaria (planes).
 * «Mis copias» queda como enlace discreto: es navegación, no la acción.
 */
function CatalogHeader({
  cta = true,
  showSections = false,
}: {
  cta?: boolean;
  showSections?: boolean;
}) {
  return (
    <>
      <h1 className="sr-only">Copiar carteras</h1>
      {showSections || cta ? (
        <div
          className={cn(
            "flex flex-col gap-4",
            showSections && "sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          {showSections ? (
            <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">
              <MarketSectionChips active="copy" showCopy />
            </div>
          ) : null}
          {cta ? (
            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 sm:ml-auto">
              <Link
                href="/app/copiar/mis-copias"
                className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg-muted underline decoration-border-control underline-offset-4 transition-colors duration-150 hover:text-fg"
              >
                Mis copias
              </Link>
              <Link
                href="/app/copiar/planes"
                className={buttonClasses({ variant: "primary", size: "md", className: "min-h-11" })}
              >
                Ver planes
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default async function CopiarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  let enabled = false;
  try {
    enabled = await isCopyEnabled();
  } catch {
    enabled = false;
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-8">
        <CatalogHeader cta={false} />
        <CopySoonState />
      </div>
    );
  }

  let index: Awaited<ReturnType<typeof getCopyIndex>>;
  try {
    index = await getCopyIndex();
  } catch {
    index = { entries: [], health: NO_FEED, aliases: {} };
  }
  const { entries, health } = index;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <CatalogHeader showSections />
        {health.state === "none" ? (
          <CopySoonState description="Todavía no hay datos del feed de Fraccion.si. Vuelve pronto." />
        ) : (
          <CopyFeedUnavailable />
        )}
      </div>
    );
  }

  // Metadatos desde el índice firmado: si el detalle no se puede leer (feed
  // vencido o firma inválida), la cartera sigue visible y sólo falta la
  // cobertura. La composición no se serializa acá.
  const baseRows = await Promise.all(
    entries.map(async (entry): Promise<Row> => {
      let coveragePct: number | null = null;
      try {
        const detail = await getCopyPortfolio(entry.slug);
        if (detail) coveragePct = coverageOf(await mapPositions(detail.positions));
      } catch {
        coveragePct = null;
      }
      return {
        entry,
        lag: lagChip(entry.asOf, entry.family, entry.isFrozen),
        lagDays: daysSince(entry.asOf),
        coveragePct,
      };
    }),
  );

  const q = one(query.q).trim().slice(0, 80);
  const familyRaw = one(query.familia);
  const activeFamily: CopyFamily | "all" = isCopyFamily(familyRaw) ? familyRaw : "all";
  const orderRaw = one(query.orden);
  const order: CatalogOrder =
    orderRaw === "atraso" || orderRaw === "nombre" ? orderRaw : "cobertura";

  const counts: Record<CopyFamily, number> = { "13f": 0, etf: 0, broker_cl: 0, afp: 0, thematic: 0 };
  for (const row of baseRows) counts[row.entry.family] += 1;

  const tabItems: FamilyTabItem[] = [
    {
      value: "all",
      label: "Todas",
      count: baseRows.length,
      href: catalogHref({ q, family: "all", order }),
    },
    ...COPY_FAMILIES.map((family) => ({
      value: family,
      label: COPY_FAMILY_LABELS[family],
      count: counts[family],
      href: catalogHref({ q, family, order }),
    })),
  ];

  const needle = fold(q);
  const filtered = baseRows.filter((row) => {
    if (activeFamily !== "all" && row.entry.family !== activeFamily) return false;
    if (!needle) return true;
    const haystack = fold(
      `${row.entry.name} ${row.entry.manager} ${row.entry.slug} ${COPY_FAMILY_LABELS[row.entry.family]}`,
    );
    return haystack.includes(needle);
  });

  const rows = [...filtered].sort((a, b) => {
    if (order === "atraso") {
      return (
        (a.lagDays ?? Number.POSITIVE_INFINITY) - (b.lagDays ?? Number.POSITIVE_INFINITY)
      );
    }
    if (order === "nombre") return a.entry.name.localeCompare(b.entry.name, "es-CL");
    return (
      (b.coveragePct ?? -1) - (a.coveragePct ?? -1) ||
      a.entry.name.localeCompare(b.entry.name, "es-CL")
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <CatalogHeader showSections />
      <div className="flex flex-col gap-3">
        <FeedBanner health={health} />
        {health.source === "fixtures" ? <ExampleDataStrip /> : null}
      </div>

      <section aria-labelledby="carteras-titulo" className="flex flex-col gap-5">
        <h2 id="carteras-titulo" className="sr-only">
          Carteras disponibles
        </h2>
        <FamilyTabs items={tabItems} active={activeFamily} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            action="/app/copiar"
            method="get"
            role="search"
            className="flex w-full items-center gap-2 lg:max-w-md"
          >
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={80}
                enterKeyHint="search"
                placeholder="Buscar por cartera o gestor"
                aria-label="Buscar carteras"
                className="h-11 w-full rounded-full border border-border-control bg-bg pr-3 pl-9 text-sm text-fg placeholder:text-fg-muted focus-visible:border-fg"
              />
            </div>
            {activeFamily !== "all" ? (
              <input type="hidden" name="familia" value={activeFamily} />
            ) : null}
            {order !== "cobertura" ? <input type="hidden" name="orden" value={order} /> : null}
            {/* Desde sm se envía con Enter: sobra el botón. */}
            <button
              type="submit"
              className={buttonClasses({
                variant: "secondary",
                size: "md",
                className: "shrink-0 sm:hidden",
              })}
            >
              Buscar
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 lg:justify-end">
            <p className="text-[13px] leading-5 text-fg-muted">
              {rows.length} {rows.length === 1 ? "cartera" : "carteras"}
              {q ? ` para «${q}»` : ""}
              {q ? (
                <>
                  {" · "}
                  <Link
                    href={catalogHref({ q: "", family: activeFamily, order })}
                    className="text-fg underline decoration-border-control underline-offset-2 hover:decoration-fg"
                  >
                    Limpiar búsqueda
                  </Link>
                </>
              ) : null}
            </p>

            <nav aria-label="Orden del catálogo" className="flex min-w-0 flex-wrap items-center gap-x-5">
              <span className="label-xs">Orden</span>
              {ORDERS.map((option) => {
                const current = order === option.value;
                return (
                  <Link
                    key={option.value}
                    href={catalogHref({ q, family: activeFamily, order: option.value })}
                    aria-current={current ? "true" : undefined}
                    title={option.title}
                    className={cn(
                      "inline-flex min-h-11 items-center text-[13px] leading-5 font-medium whitespace-nowrap transition-colors duration-150 ease-spring",
                      current ? "text-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    <span className={cn(current && "underline decoration-2 underline-offset-[5px]")}>
                      {option.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {rows.length === 0 ? (
          <CopyNoResults resetHref={catalogHref({ q: "", family: "all", order })} />
        ) : (
          <div className="flex flex-col">
            <div className={PORTFOLIO_HEADER_GRID}>
              <span className={HEADER_CELL}>Cartera</span>
              <span className={HEADER_CELL}>Familia</span>
              <span className={HEADER_CELL}>Dato</span>
              <span className={HEADER_CELL}>Atraso</span>
              <span className={`${HEADER_CELL} text-right`}>Cobertura</span>
            </div>
            <ul className="border-t border-border md:border-t-0">
              {rows.map((row) => (
                <PortfolioCard
                  key={row.entry.slug}
                  portfolio={row.entry}
                  lag={row.lag}
                  coveragePct={row.coveragePct}
                />
              ))}
            </ul>
            <p className="mt-3 max-w-prose text-[13px] leading-5 text-fg-muted">
              Cobertura: parte del portafolio declarado que se puede replicar con el catálogo de
              Maverlang.
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <FraccionSeal />
        <LegalNote cta disclaimer />
      </div>
    </div>
  );
}
