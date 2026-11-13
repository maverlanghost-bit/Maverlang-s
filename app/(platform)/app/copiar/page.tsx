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
import { PortfolioCard } from "@/components/copy/portfolio-card";
import { buttonClasses } from "@/components/ui/button";
import { IconSearch } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
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

function CatalogHeader() {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Copiar carteras
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Carteras 13F y ETF para replicar con acciones de Maverlang, y corredoras chilenas, AFP y
            temáticas para mirar. Cada tarjeta muestra la fecha del dato, el atraso y la cobertura.
          </p>
        </div>
        <Link
          href="/app/copiar/planes"
          className={buttonClasses({ variant: "secondary", size: "md", className: "shrink-0" })}
        >
          Ver planes
        </Link>
      </div>
      <FraccionSeal />
    </header>
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
      <div className="flex flex-col gap-6">
        <CatalogHeader />
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
      <div className="flex flex-col gap-6">
        <CatalogHeader />
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
      <CatalogHeader />
      <FeedBanner health={health} />
      {health.source === "fixtures" ? <ExampleDataStrip /> : null}

      <section aria-labelledby="carteras-titulo" className="flex flex-col gap-4">
        <h2 id="carteras-titulo" className="sr-only">
          Carteras disponibles
        </h2>
        <FamilyTabs items={tabItems} active={activeFamily} />

        <form
          action="/app/copiar"
          method="get"
          className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex w-full items-center gap-2 lg:max-w-md">
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={80}
                placeholder="Buscar por cartera o gestor"
                aria-label="Buscar carteras"
                className="h-11 w-full rounded-full border border-border-strong bg-surface-1 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-fg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
              />
            </div>
            {activeFamily !== "all" ? (
              <input type="hidden" name="familia" value={activeFamily} />
            ) : null}
            {order !== "cobertura" ? <input type="hidden" name="orden" value={order} /> : null}
            <button
              type="submit"
              className={buttonClasses({
                variant: "secondary",
                size: "md",
                className: "shrink-0",
              })}
            >
              Buscar
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
              Orden
            </span>
            {ORDERS.map((option) => {
              const current = order === option.value;
              return (
                <Link
                  key={option.value}
                  href={catalogHref({ q, family: activeFamily, order: option.value })}
                  aria-current={current ? "true" : undefined}
                  title={option.title}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-fg/20",
                    current
                      ? "bg-surface-3 text-fg"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
          <p>
            {rows.length} {rows.length === 1 ? "cartera" : "carteras"}
            {q ? ` para «${q}»` : ""}
          </p>
          {q ? (
            <Link
              href={catalogHref({ q: "", family: activeFamily, order })}
              className="underline decoration-border-strong underline-offset-2 hover:text-fg"
            >
              Limpiar búsqueda
            </Link>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <CopyNoResults resetHref={catalogHref({ q: "", family: "all", order })} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <PortfolioCard
                key={row.entry.slug}
                portfolio={row.entry}
                lag={row.lag}
                coveragePct={row.coveragePct}
              />
            ))}
          </div>
        )}
      </section>

      <LegalNote cta disclaimer />
    </div>
  );
}
