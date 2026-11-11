"use client";

import { useMemo, useState } from "react";

import { PublicAssetCard, type PublicAssetCardItem } from "@/components/landing/public-asset-card";
import { EmptyState } from "@/components/ui/empty-state";

export type PublicCatalogItem = PublicAssetCardItem;

type CatalogFilter = "all" | "stock" | "etf";

const FILTERS: readonly { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "stock", label: "Acciones" },
  { id: "etf", label: "ETFs" },
];

/** Filas que se revelan por click: 446 fichas de una sola vez son ~18.000 px de scroll. */
const PAGE_SIZE = 48;
const SAMPLE_SIZE = 3;

const PILL_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 text-xs font-medium transition duration-[140ms] ease-spring sm:min-h-9 sm:px-3";
const PILL_ACTIVE = "border-fg bg-fg text-bg";
const PILL_IDLE = "border-control bg-bg text-fg-body hover:bg-surface-1";

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

  // La paginación vuelve a 48 al cambiar de filtro o de búsqueda, sin efecto:
  // el límite guardado sólo vale para la combinación con la que se pidió.
  const key = `${filter}|${query}`;
  const limit = page.key === key ? page.limit : PAGE_SIZE;
  const visible = results.slice(0, limit);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o ticker (ej. Apple, NVDA, S&P 500)..."
          aria-label="Buscar acciones o ETFs"
          className="min-h-11 w-full rounded-full border border-control bg-bg px-4 text-sm text-fg transition placeholder:text-fg-muted hover:border-fg/60 sm:max-w-md"
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
        <div className="mt-6">
          <EmptyState
            title="No encontramos resultados"
            description="Prueba con otro nombre o ticker, o limpia los filtros para ver el catálogo completo."
            action={
              <div className="flex flex-col items-center gap-3">
                {samples.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs text-fg-muted">Prueba con:</span>
                    {samples.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setFilter("all");
                          setQuery(name);
                        }}
                        className={`${PILL_BASE} ${PILL_IDLE}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button type="button" onClick={clearFilters} className={`${PILL_BASE} ${PILL_IDLE}`}>
                  Limpiar filtros
                </button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-fg-muted">
            <p>Acción = empresa · ETF = fondo. Cada ficha abre el detalle del token.</p>
            <p>
              {visible.length} de {results.length}
            </p>
          </div>

          <nav aria-label="Índice por letra" className="no-scrollbar -mx-5 mt-3 overflow-x-auto px-5">
            <ul className="flex w-max items-center gap-0.5">
              {groups.map((group) => (
                <li key={`indice-${group.letter}`}>
                  <a
                    href={`#activos-${letterAnchor(group.letter)}`}
                    className="inline-flex min-h-11 min-w-9 items-center justify-center rounded-full px-2 font-mono text-xs font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg sm:min-h-8"
                  >
                    {group.letter}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-2 space-y-5">
            {groups.map((group) => (
              <section
                key={group.letter}
                id={`activos-${letterAnchor(group.letter)}`}
                aria-label={`Activos que empiezan con ${group.letter}`}
              >
                <p className="sticky top-16 z-10 -mx-5 flex items-baseline gap-2 border-b border-border bg-bg/95 px-5 py-2 backdrop-blur-sm">
                  <span className="font-mono text-sm font-medium text-fg">{group.letter}</span>
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {group.items.map((asset) => (
                    <li key={asset.slug}>
                      <PublicAssetCard asset={asset} variant="row" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {visible.length < results.length ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setPage({ key, limit: limit + PAGE_SIZE })}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-control bg-bg px-5 text-sm font-medium text-fg transition hover:bg-surface-1 sm:min-h-10"
              >
                Ver {Math.min(PAGE_SIZE, results.length - visible.length)} más
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
