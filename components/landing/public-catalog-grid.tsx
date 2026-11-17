"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  PublicAssetCard,
  publicAssetGridColumns,
  type PublicAssetCardItem,
} from "@/components/landing/public-asset-card";
import { Button } from "@/components/ui/button";
import { ActiveFilters } from "@/components/ui/active-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export type PublicCatalogItem = PublicAssetCardItem;

type CatalogFilter = "all" | "stock" | "etf";

const FILTERS: readonly { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "stock", label: "Acciones" },
  { id: "etf", label: "ETFs" },
];

const ICON_PROPS = {
  viewBox: "0 0 16 16",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  "aria-hidden": true,
};

const VIEWS: readonly { id: CatalogView; label: string; icon: ReactNode }[] = [
  {
    id: "table",
    label: "Ver como tabla",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
      </svg>
    ),
  },
  {
    id: "cards",
    label: "Ver como tarjetas",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
      </svg>
    ),
  },
];

/** Filas que se revelan por click: las ~446 de una sola vez son ~25.000 px. */
const PAGE_SIZE = 40;
const SAMPLE_SIZE = 3;

type CatalogView = "table" | "cards";

/** Filtro como pestaña subrayada: la fila de datos manda, no las píldoras. */
const TAB_BASE =
  "inline-flex min-h-11 items-center border-b-2 px-0.5 pt-1 pb-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-spring";
const TAB_ACTIVE = "border-fg text-fg";
const TAB_IDLE = "border-transparent text-fg-muted hover:border-border-strong hover:text-fg";

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
  const haystack = normalize(`${asset.name} ${asset.ticker} ${asset.symbol} ${asset.sector ?? ""}`);
  return terms.every((term) => haystack.includes(term));
}

/** Letra del índice: A-Z o "#" para cifras y símbolos. */
function letterOf(name: string): string {
  const first = normalize(name).charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

/** `#` no puede ir en un fragmento de URL: se ancla como "otros". */
function letterAnchor(letter: string): string {
  return letter === "#" ? "otros" : letter.toLowerCase();
}

export function PublicCatalogGrid({ assets }: { assets: readonly PublicCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [view, setView] = useState<CatalogView>("table");
  const [page, setPage] = useState<{ key: string; limit: number }>({ key: "", limit: PAGE_SIZE });

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

  // La paginación vuelve a 40 al cambiar de filtro o de búsqueda, sin efecto:
  // el límite guardado sólo vale para la combinación con la que se pidió.
  const key = `${filter}|${query}`;
  const limit = page.key === key ? page.limit : PAGE_SIZE;
  const visible = results.slice(0, limit);

  /**
   * La columna de precio sólo existe si algún activo trae precio formateado.
   * Hoy el catálogo público no lo entrega: la tabla sale con tres columnas.
   */
  const hasPrice = useMemo(() => assets.some((asset) => Boolean(asset.price?.trim())), [assets]);

  // Agrupación por letra en un Map: aunque el orden alfabético deje un grupo
  // partido (p. ej. nombres con cifras), la letra aparece una sola vez.
  const byLetter = new Map<string, PublicCatalogItem[]>();
  for (const asset of visible) {
    const letter = letterOf(asset.name);
    const bucket = byLetter.get(letter);
    if (bucket) bucket.push(asset);
    else byLetter.set(letter, [asset]);
  }
  const groups = [...byLetter.entries()].map(([letter, items]) => ({ letter, items }));

  /** Tres fichas reales del catálogo: sirven de ejemplo y siempre existen. */
  const samples = useMemo(() => {
    if (assets.length === 0) return [];
    const step = Math.max(1, Math.floor(assets.length / SAMPLE_SIZE));
    const picked = [assets[0], assets[step], assets[step * 2]].filter(
      (asset): asset is PublicCatalogItem => Boolean(asset),
    );
    return [...new Set(picked.map((asset) => asset.name))];
  }, [assets]);

  const filters = FILTERS.map((option) =>
    option.id === "all" ? { ...option, label: `Todos (${assets.length})` } : option,
  );

  function clearFilters() {
    setQuery("");
    setFilter("all");
  }

  return (
    // La barra fija y el índice por letra se apilan bajo el header de 4 rem. Sus
    // alturas son fijas (variable `--catalog-bar`) para que el índice sepa dónde
    // pegarse sin medir nada en el cliente.
    <div className="[--catalog-bar:6.75rem] sm:[--catalog-bar:3.75rem]">
      <div className="sticky top-16 z-30 -mx-5 flex h-[var(--catalog-bar)] flex-col justify-center gap-1 border-b border-border bg-bg/95 px-5 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-6">
        <div className="w-full sm:min-w-0 sm:flex-1 sm:max-w-md">
          <label htmlFor="catalogo-buscar" className="sr-only">
            Buscar acciones o ETFs
          </label>
          <input
            id="catalogo-buscar"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o ticker (Apple, NVDA, S&P 500)..."
            className="min-h-11 w-full rounded-full border border-border-control bg-bg px-4 text-base text-fg transition placeholder:text-fg-subtle hover:border-fg/60"
          />
        </div>

        <div className="flex items-center justify-between gap-4 sm:ml-auto sm:shrink-0 sm:justify-end sm:gap-6">
          <div role="group" aria-label="Filtrar por tipo" className="flex items-center gap-x-5">
            {filters.map((option) => {
              const active = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option.id)}
                  className={cn(TAB_BASE, active ? TAB_ACTIVE : TAB_IDLE)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div role="group" aria-label="Vista del catálogo" className="flex items-center">
            {VIEWS.map((option) => {
              const active = view === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={option.label}
                  title={option.label}
                  onClick={() => setView(option.id)}
                  className="group/view inline-flex size-11 items-center justify-center"
                >
                  <span
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-full border transition-colors duration-150 ease-spring",
                      active
                        ? "border-fg bg-fg text-white"
                        : "border-transparent text-fg-muted group-hover/view:bg-surface-2 group-hover/view:text-fg",
                    )}
                  >
                    {option.icon}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3"><ActiveFilters filters={[...(query.trim() ? [{ id: "query", label: query.trim(), remove: () => setQuery("") }] : []), ...(filter !== "all" ? [{ id: "type", label: FILTERS.find((option) => option.id === filter)?.label ?? filter, remove: () => setFilter("all") }] : [])]} onClear={clearFilters} /></div>
      <p aria-live="polite" className="sr-only">
        {results.length === 1 ? "1 resultado" : `${results.length} resultados`}
      </p>

      {results.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No encontramos resultados"
            description="Prueba con otro nombre o ticker, o limpia los filtros para ver el catálogo completo."
            action={
              <div className="flex flex-col items-center gap-3">
                {samples.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                    <span className="text-xs text-fg-muted">Prueba con:</span>
                    {samples.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setFilter("all");
                          setQuery(name);
                        }}
                        className="inline-flex min-h-11 items-center text-[13px] text-fg-muted underline decoration-border underline-offset-4 transition hover:text-fg hover:decoration-fg"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Button variant="secondary" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-4 text-[13px] text-fg-muted">
            Acción = empresa · ETF = fondo. Cada fila abre la ficha del token.
          </p>

          {/* Índice por letra: única agrupación de la página. Pegado bajo la
              barra fija desde `sm`; en móvil la barra ocupa dos filas y el
              índice se desplaza con la página. */}
          <nav
            aria-label="Índice por letra"
            className="z-20 -mx-5 mt-2 border-b border-border bg-bg/95 px-5 backdrop-blur-sm sm:sticky sm:top-[calc(4rem+var(--catalog-bar))]"
          >
            <ul className="no-scrollbar flex items-center gap-1 overflow-x-auto overscroll-x-contain">
              {groups.map((group) => (
                <li key={`indice-${group.letter}`}>
                  <a
                    href={`#activos-${letterAnchor(group.letter)}`}
                    className="inline-flex min-h-11 min-w-8 items-center justify-center px-1 font-mono text-[13px] font-medium text-fg-muted transition hover:text-fg sm:min-h-8"
                  >
                    {group.letter}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-5 space-y-5">
            {groups.map((group) => (
              <section
                key={group.letter}
                id={`activos-${letterAnchor(group.letter)}`}
                aria-label={`Activos que empiezan con ${group.letter}`}
                className="scroll-mt-28 sm:scroll-mt-12"
              >
                {view === "table" ? (
                  <div className="overflow-hidden rounded-bento border border-border">
                    {/* Cabecera del grupo: letra, conteo y, desde `sm`, los
                        rótulos de columna con la misma plantilla que las filas. */}
                    <div
                      className={cn(
                        "grid items-center gap-x-3 border-b border-border bg-surface-1 px-4 py-2 sm:gap-x-4",
                        publicAssetGridColumns(hasPrice),
                      )}
                    >
                      <h2 className="col-span-2 flex items-baseline gap-3 sm:col-span-3">
                        <span className="font-mono text-[13px] font-medium tracking-[0.045em] text-fg uppercase">
                          {group.letter}
                        </span>
                        <span className="num text-[13px] text-fg-muted">{group.items.length}</span>
                      </h2>
                      <span aria-hidden className="label-xs hidden sm:block">
                        Sector
                      </span>
                      {hasPrice ? (
                        <span aria-hidden className="label-xs hidden text-right sm:block">
                          Precio
                        </span>
                      ) : null}
                    </div>
                    <ul className="divide-y divide-border">
                      {group.items.map((asset) => (
                        <li key={asset.slug}>
                          <PublicAssetCard asset={asset} variant="table" showPrice={hasPrice} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <>
                    <h2 className="flex items-baseline gap-3 pb-3">
                      <span className="font-mono text-[13px] font-medium tracking-[0.045em] text-fg uppercase">
                        {group.letter}
                      </span>
                      <span className="num text-[13px] text-fg-muted">{group.items.length}</span>
                    </h2>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((asset) => (
                        <li key={asset.slug}>
                          <PublicAssetCard asset={asset} variant="card" className="h-full" />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            ))}
          </div>

          {visible.length < results.length ? (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-5">
              <p className="num text-[13px] text-fg-muted">
                Mostrando {visible.length} de {results.length}
              </p>
              <Button variant="secondary" onClick={() => setPage({ key, limit: limit + PAGE_SIZE })}>
                Ver {Math.min(PAGE_SIZE, results.length - visible.length)} más
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
