"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { logoPathFromSymbol } from "@/lib/catalog/logos";

export type PublicCatalogItem = {
  slug: string;
  name: string;
  ticker: string;
  symbol: string;
  etf: boolean;
};

type CatalogFilter = "all" | "stock" | "etf";

const FILTERS: readonly { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "stock", label: "Acciones" },
  { id: "etf", label: "ETFs" },
];

const PILL_BASE =
  "inline-flex min-h-9 items-center justify-center rounded-full border px-3.5 py-1.5 text-xs font-medium outline-none transition duration-150 focus-visible:ring-4 focus-visible:ring-fg/20";

const PILL_ACTIVE = "border-fg bg-fg text-bg";
const PILL_IDLE = "border-border bg-white text-fg-body hover:border-border-strong hover:bg-surface-1";

/** Minúsculas y sin tildes: "S&P 500" y "s&p 500" caen en el mismo término. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesTerms(asset: PublicCatalogItem, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normalize(`${asset.name} ${asset.ticker} ${asset.symbol}`);
  return terms.every((term) => haystack.includes(term));
}

export function PublicCatalogGrid({ assets }: { assets: readonly PublicCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");

  const terms = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);

  const results = useMemo(
    () =>
      assets.filter((asset) => {
        if (filter === "stock" && asset.etf) return false;
        if (filter === "etf" && !asset.etf) return false;
        return matchesTerms(asset, terms);
      }),
    [assets, filter, terms],
  );

  const filters = FILTERS.map((option) =>
    option.id === "all" ? { ...option, label: `Todos (${assets.length})` } : option,
  );

  function clearFilters() {
    setQuery("");
    setFilter("all");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o ticker (ej. Apple, NVDA, S&P 500)..."
          aria-label="Buscar acciones o ETFs"
          className="w-full rounded-full border border-border bg-white px-4 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-muted focus-visible:ring-4 focus-visible:ring-fg/20 sm:max-w-md"
        />

        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          {filters.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.id)}
                className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_IDLE}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {results.length === 1 ? "1 resultado" : `${results.length} resultados`}
      </p>

      {results.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-1/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-fg">No encontramos resultados</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
            Prueba con otro nombre o ticker, o revisa el catálogo completo.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-medium text-fg outline-none transition hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((asset) => (
            <li key={asset.slug}>
              <Link
                href={`/acciones/${asset.slug}`}
                className="group flex min-h-20 flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(12,15,20,0.03)] transition hover:-translate-y-0.5 hover:border-fg/25 hover:shadow-md focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
              >
                <div className="flex items-center gap-3">
                  <TickerLogo
                    symbol={asset.symbol}
                    name={asset.name}
                    logoUrl={logoPathFromSymbol(asset.symbol)}
                    size={40}
                    decorative
                    loading="lazy"
                    sizes="40px"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{asset.name}</span>
                  <span className="shrink-0 font-mono text-xs text-fg-muted">{asset.ticker}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-1 px-2.5 py-0.5 font-mono text-[11px] font-medium text-fg-body">
                    {asset.symbol}
                  </span>
                  <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-fg-muted">
                    {asset.etf ? "ETF EE.UU." : "Acción EE.UU."}
                  </span>
                  <span className="ml-auto text-xs font-medium text-brand transition-transform group-hover:translate-x-0.5">
                    Ver ficha →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
