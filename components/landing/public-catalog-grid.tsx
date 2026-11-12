"use client";

import { useMemo, useState } from "react";

import {
  PublicAssetCard,
  publicAssetGridColumns,
  type PublicAssetCardItem,
} from "@/components/landing/public-asset-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export type PublicCatalogItem = PublicAssetCardItem;

type CatalogFilter = "all" | "stock" | "etf";

const FILTERS: readonly { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "stock", label: "Acciones" },
  { id: "etf", label: "ETFs" },
];

/** Filas que se revelan por click: las ~446 de una sola vez son ~25.000 px. */
const PAGE_SIZE = 40;
const SAMPLE_SIZE = 3;

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
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="w-full sm:max-w-sm">
          <label htmlFor="catalogo-buscar" className="sr-only">
            Buscar acciones o ETFs
          </label>
          <input
            id="catalogo-buscar"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o ticker (Apple, NVDA, S&P 500)..."
            className="min-h-11 w-full rounded-md border border-border-control bg-bg px-3 text-sm text-fg transition placeholder:text-fg-subtle hover:border-fg/60"
          />
        </div>

        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap items-center gap-x-6">
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
      </div>

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
          <p className="mt-3 text-xs text-fg-muted">
            Acción = empresa · ETF = fondo. Cada fila abre la ficha del token.
          </p>

          {/* Encabezado de columnas: desde `sm`, cuando caben las celdas. */}
          <div
            aria-hidden
            className={cn(
              "mt-4 hidden items-center gap-x-4 border-b border-border pb-2 sm:grid",
              publicAssetGridColumns(hasPrice),
            )}
          >
            <span className="label-xs">Ticker</span>
            <span className="label-xs">Nombre</span>
            <span className="label-xs">Sector</span>
            {hasPrice ? <span className="label-xs text-right">Precio</span> : null}
          </div>

          {/* Índice sticky: única agrupación de la página (por letra). */}
          <nav
            aria-label="Índice por letra"
            className="sticky top-16 z-20 -mx-5 mt-2 border-b border-border bg-bg/95 px-5 backdrop-blur-sm"
          >
            <ul className="no-scrollbar flex items-center gap-1 overflow-x-auto">
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

          <div>
            {groups.map((group) => (
              <section
                key={group.letter}
                id={`activos-${letterAnchor(group.letter)}`}
                aria-label={`Activos que empiezan con ${group.letter}`}
                className="scroll-mt-16"
              >
                <h2 className="flex items-baseline gap-3 border-b border-border pt-7 pb-2">
                  <span className="font-mono text-[13px] font-medium tracking-[0.045em] text-fg uppercase">
                    {group.letter}
                  </span>
                  <span className="num text-[13px] text-fg-muted">{group.items.length}</span>
                </h2>
                <ul className="divide-y divide-border">
                  {group.items.map((asset) => (
                    <li key={asset.slug}>
                      <PublicAssetCard asset={asset} variant="table" showPrice={hasPrice} />
                    </li>
                  ))}
                </ul>
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
