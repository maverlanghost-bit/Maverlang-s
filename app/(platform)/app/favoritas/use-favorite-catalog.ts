"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { isCatalogSymbol } from "@/lib/catalog/symbol";

/**
 * Catálogo paginado de Favoritas: una sola consulta por página en vez de una
 * búsqueda por símbolo.
 */
export const FAVORITES_CATALOG_PAGE_SIZE = 50;

/**
 * La portada de Mercado (`market-today`) ya pide la primera página completa
 * con estos mismos parámetros. Se reutiliza su clave para que entrar a
 * Favoritas desde `/app` no dispare otra petición de catálogo. Si esa clave
 * cambia en el futuro, esta pantalla igual funciona: pide su propia página.
 */
const MARKET_FULL_CATALOG_KEY = [
  "market-today-spotlight-catalog",
  "listed",
  FAVORITES_CATALOG_PAGE_SIZE,
  "liquidity",
] as const;

/**
 * Mismo frescor que la portada de Mercado. Si Favoritas pidiera cada minuto
 * una página que Mercado acaba de cachear, la clave compartida no ahorraría
 * la petición. El catálogo vive 5 min en el servidor.
 */
const CATALOG_STALE_MS = 5 * 60_000;

/** Retiene el catálogo para volver desde Mercado sin otra petición. */
const CATALOG_GC_MS = 10 * 60_000;

/** Tope defensivo: 20 páginas de 50 = 1.000 activos visibles. */
const MAX_CATALOG_PAGES = 20;

/**
 * Página 1: clave compartida con Mercado. Páginas siguientes: misma forma de
 * clave que `useMarketSearch` (`["market-search", q, categoría, página, tamaño, orden, alcance]`).
 */
function catalogKeys(page: number) {
  if (page === 1) return MARKET_FULL_CATALOG_KEY;
  return [
    "market-search",
    "",
    "all",
    page,
    FAVORITES_CATALOG_PAGE_SIZE,
    "liquidity",
    "listed",
  ] as const;
}

function catalogQueryOptions(page: number, enabled: boolean) {
  return {
    queryKey: catalogKeys(page),
    queryFn: () =>
      searchMarket({
        q: "",
        category: "all",
        page,
        pageSize: FAVORITES_CATALOG_PAGE_SIZE,
        sort: "liquidity",
        scope: "listed",
      }),
    enabled,
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_GC_MS,
    refetchOnWindowFocus: false as const,
  };
}

export type FavoriteCatalog = {
  items: MarketSearchItem[];
  /** Índice por símbolo en minúsculas: las favoritas guardadas usan mayúsculas. */
  bySymbol: Map<string, MarketSearchItem>;
  /** Primera página pendiente: todavía no hay nombres ni logos que mostrar. */
  isInitialPending: boolean;
  /** Queda cargando mientras falte alguna página. */
  isPending: boolean;
  /** Sólo la primera página: sin ella no hay catálogo que mostrar. */
  isError: boolean;
  /** Todas las páginas terminaron, con éxito o error: sirve para filtrar precios sin esperar más. */
  isSettled: boolean;
  /** Todas las páginas respondieron bien. */
  isComplete: boolean;
  refetch: () => void;
};

/**
 * Trae el catálogo visible una vez y lo deja indexado para todas las filas.
 * La primera página se pide sola. Las siguientes se calculan con `total` y se
 * lanzan en paralelo (sin cadena de peticiones por símbolo); si la primera ya
 * contiene todas las favoritas, no se pide ninguna más.
 */
export function useFavoriteCatalog(symbols: readonly string[]): FavoriteCatalog {
  /**
   * Una favorita guardada con un formato viejo o inválido nunca va a aparecer
   * en el catálogo. Se ignora para no pedir todas las páginas en cada visita.
   */
  const wanted = useMemo(() => {
    const set = new Set<string>();
    for (const symbol of symbols) {
      const trimmed = symbol.trim();
      if (!isCatalogSymbol(trimmed)) continue;
      set.add(trimmed.toLowerCase());
    }
    return set;
  }, [symbols]);

  const enabled = wanted.size > 0;
  const first = useQuery(catalogQueryOptions(1, enabled));
  const {
    data: firstData,
    isError: firstIsError,
    isPending: firstIsPending,
    isSuccess: firstIsSuccess,
    refetch: refetchFirst,
  } = first;

  /**
   * El caso normal es que la portada de Mercado ya haya cacheado la primera
   * página y todas las favoritas estén ahí. Sólo cuando falta alguna se piden
   * las páginas restantes.
   */
  const firstCoversAll = useMemo(() => {
    if (!enabled) return false;
    const items = firstData?.items;
    if (!items || items.length === 0) return false;
    const found = new Set(items.map((item) => item.symbol.toLowerCase()));
    for (const symbol of wanted) {
      if (!found.has(symbol)) return false;
    }
    return true;
  }, [enabled, firstData, wanted]);

  const total = firstData?.total ?? 0;
  const pageCount = Math.min(
    MAX_CATALOG_PAGES,
    Math.max(1, Math.ceil(total / FAVORITES_CATALOG_PAGE_SIZE)),
  );
  const restCount = firstCoversAll ? 0 : Math.max(0, pageCount - 1);
  const rest = useQueries({
    queries: Array.from({ length: restCount }, (_, index) =>
      catalogQueryOptions(index + 2, enabled && firstIsSuccess),
    ),
  });

  return useMemo<FavoriteCatalog>(() => {
    const items: MarketSearchItem[] = [];
    const bySymbol = new Map<string, MarketSearchItem>();
    const add = (pageItems: readonly MarketSearchItem[] | undefined) => {
      for (const item of pageItems ?? []) {
        const key = item.symbol.toLowerCase();
        if (bySymbol.has(key)) continue;
        bySymbol.set(key, item);
        items.push(item);
      }
    };
    add(firstData?.items);
    for (const query of rest) add(query.data?.items);

    return {
      items,
      bySymbol,
      isInitialPending: enabled && firstIsPending,
      isPending: enabled && (firstIsPending || rest.some((query) => query.isPending)),
      isError: enabled && firstIsError,
      isSettled:
        enabled &&
        firstIsSuccess &&
        rest.every((query) => query.isSuccess || query.isError),
      isComplete:
        enabled && firstIsSuccess && rest.every((query) => query.isSuccess),
      refetch: () => {
        void refetchFirst();
        for (const query of rest) void query.refetch();
      },
    };
  }, [
    enabled,
    firstData,
    firstIsError,
    firstIsPending,
    firstIsSuccess,
    refetchFirst,
    rest,
  ]);
}
