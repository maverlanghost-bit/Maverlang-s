"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

import {
  INDEX_SYMBOLS,
  MAX_CONTEXT_ITEMS,
  PORTFOLIO_ITEM,
  isInContext,
  type ContextItem,
} from "@/components/ai/context-types";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { MarketSearchItem } from "@/lib/api/client";
import { useMarketSearch, usePortfolio, useTickers } from "@/lib/hooks/queries";
import { formatMoney, formatShares } from "@/lib/format";
import type { Ticker } from "@/lib/types";
import { cn } from "@/lib/cn";

type ContextPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: readonly ContextItem[];
  onToggle: (item: ContextItem) => void;
};

type PickerOption = {
  item: ContextItem;
  logoUrl: string | null;
  subtitle: string;
};

const TABS = [
  { id: "stocks", label: "Acciones" },
  { id: "indices", label: "Índices y ETFs" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function subscribeNoop() {
  return () => {};
}

/** El portal sólo existe en el cliente: en SSR no hay `document`. */
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function stockItem(ticker: Ticker): ContextItem {
  return {
    id: `stock:${ticker.symbol}`,
    kind: "stock",
    symbol: ticker.symbol,
    name: ticker.name,
  };
}

function marketOption(row: MarketSearchItem): PickerOption {
  const isIndex = row.category === "etf" || INDEX_SYMBOLS.some((symbol) => symbol === row.symbol);
  const kind: ContextItem["kind"] = isIndex ? "index" : "stock";
  return {
    item: { id: `${kind}:${row.symbol}`, kind, symbol: row.symbol, name: row.name },
    logoUrl: row.logoUrl,
    subtitle: row.symbol,
  };
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("size-4", className)}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("size-4", className)}
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h2" />
    </svg>
  );
}

function AddControl({
  item,
  added,
  atLimit,
  onToggle,
}: {
  item: ContextItem;
  added: boolean;
  atLimit: boolean;
  onToggle: (item: ContextItem) => void;
}) {
  if (added) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggle(item)}
          aria-pressed="true"
          aria-label={`Quitar ${item.symbol} del contexto`}
          className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-white transition hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:outline-none"
        >
          Añadido ✓
        </button>
        <button
          type="button"
          onClick={() => onToggle(item)}
          aria-label={`Quitar ${item.symbol} del contexto`}
          className="rounded-full px-1.5 py-1 text-[11px] font-medium text-zinc-500 underline-offset-2 transition hover:text-zinc-900 hover:underline focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none"
        >
          Quitar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-disabled={atLimit || undefined}
      title={atLimit ? `Máximo ${MAX_CONTEXT_ITEMS}` : undefined}
      onClick={() => {
        if (atLimit) return;
        onToggle(item);
      }}
      aria-pressed="false"
      aria-label={`Añadir ${item.symbol} al contexto`}
      className={cn(
        "shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-zinc-700 transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none",
        atLimit && "cursor-not-allowed opacity-45 hover:bg-white",
      )}
    >
      Añadir
    </button>
  );
}

function OptionRow({
  option,
  selected,
  onToggle,
}: {
  option: PickerOption;
  selected: readonly ContextItem[];
  onToggle: (item: ContextItem) => void;
}) {
  const added = isInContext(selected, option.item.id);
  const atLimit = !added && selected.length >= MAX_CONTEXT_ITEMS;

  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-zinc-100/70">
      <TickerLogo
        symbol={option.item.symbol}
        name={option.item.name}
        logoUrl={option.logoUrl}
        size={36}
        decorative
        loading="lazy"
        sizes="40px"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-zinc-900">{option.item.name}</span>
        <span className="block truncate text-xs text-zinc-500">{option.subtitle}</span>
      </span>
      <AddControl item={option.item} added={added} atLimit={atLimit} onToggle={onToggle} />
    </li>
  );
}

function RowSkeleton() {
  return <li aria-hidden className="h-[58px] animate-pulse rounded-2xl bg-zinc-100" />;
}

function EmptyMessage({ children }: { children: string }) {
  return <p className="px-3 py-6 text-sm text-zinc-500">{children}</p>;
}

function ContextPickerDialog({
  onOpenChange,
  selected,
  onToggle,
}: {
  onOpenChange: (open: boolean) => void;
  selected: readonly ContextItem[];
  onToggle: (item: ContextItem) => void;
}) {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<TabId>("stocks");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const portfolio = usePortfolio();
  const tickers = useTickers();

  const tickerBySymbol = useMemo(() => {
    const map = new Map<string, Ticker>();
    for (const ticker of tickers.data ?? []) {
      map.set(ticker.symbol.toLowerCase(), ticker);
    }
    return map;
  }, [tickers.data]);

  const searchTerm = query.trim();
  const searchMode = searchTerm.length > 0;
  const searchQ = searchTerm.length >= 2 ? debounced : "";
  const market = useMarketSearch(
    { q: debounced, pageSize: 8, sort: "liquidity" },
    debounced.length >= 2,
  );

  // Debounce de 250 ms; con menos de 2 letras se apaga la búsqueda.
  useEffect(() => {
    const trimmed = query.trim();
    const delay = trimmed.length >= 2 ? 250 : 0;
    const timer = window.setTimeout(() => {
      setDebounced(trimmed.length >= 2 ? trimmed : "");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Foco inicial en el buscador; al cerrar, vuelve al elemento que abrió el modal.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previous?.focus();
    };
  }, []);

  // Escape cierra y Tab/Shift+Tab queda atrapado dentro del panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute("disabled"),
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  // Bloquea el scroll de la página mientras el modal está abierto.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const positions = portfolio.data?.positions ?? [];

  const stockOptions = useMemo<PickerOption[]>(() => {
    const rows = [...(tickers.data ?? [])]
      .filter(
        (ticker) =>
          ticker.enabled &&
          ticker.category !== "etf" &&
          !INDEX_SYMBOLS.some((symbol) => symbol === ticker.symbol),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return rows.slice(0, 8).map((ticker) => ({
      item: stockItem(ticker),
      logoUrl: ticker.logo || null,
      subtitle: ticker.symbol,
    }));
  }, [tickers.data]);

  const indexOptions = useMemo<PickerOption[]>(() => {
    return INDEX_SYMBOLS.map((symbol) => {
      const ticker = tickerBySymbol.get(symbol.toLowerCase());
      return {
        item: {
          id: `index:${symbol}`,
          kind: "index" as const,
          symbol,
          name: ticker?.name ?? symbol,
        },
        logoUrl: ticker?.logo ?? null,
        subtitle: ticker?.name ? symbol : "ETF",
      };
    });
  }, [tickerBySymbol]);

  const searchOptions = useMemo<PickerOption[]>(() => {
    const rows = (market.data?.items ?? []).filter((row) => row.enabled);
    const seen = new Set<string>();
    const options: PickerOption[] = [];
    for (const row of rows) {
      const option = marketOption(row);
      if (seen.has(option.item.id)) continue;
      seen.add(option.item.id);
      options.push(option);
    }
    return options;
  }, [market.data]);

  const portfolioTotal = portfolio.data?.totalUsd;
  const portfolioItemAdded = isInContext(selected, PORTFOLIO_ITEM.id);
  const portfolioAtLimit = !portfolioItemAdded && selected.length >= MAX_CONTEXT_ITEMS;

  function renderFeatured() {
    if (searchMode) {
      if (searchTerm.length < 2) {
        return <EmptyMessage>Escribe al menos 2 letras para buscar.</EmptyMessage>;
      }
      if (!searchQ || market.isPending) {
        return (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        );
      }
      if (market.isError) {
        return <EmptyMessage>No pudimos buscar. Intenta de nuevo.</EmptyMessage>;
      }
      if (searchOptions.length === 0) {
        return <EmptyMessage>{`Sin resultados para «${searchTerm}».`}</EmptyMessage>;
      }
      return (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {searchOptions.map((option) => (
            <OptionRow
              key={option.item.id}
              option={option}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </ul>
      );
    }

    if (tickers.isPending) {
      return (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </ul>
      );
    }
    if (tickers.isError) {
      return <EmptyMessage>No pudimos cargar el catálogo.</EmptyMessage>;
    }

    const options = tab === "stocks" ? stockOptions : indexOptions;
    if (options.length === 0) {
      return <EmptyMessage>No hay instrumentos disponibles.</EmptyMessage>;
    }
    return (
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {options.map((option) => (
          <OptionRow
            key={option.item.id}
            option={option}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </ul>
    );
  }

  const dialog = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-zinc-950/35 backdrop-blur-[2px]"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Agregar contexto"
        tabIndex={-1}
        initial={reduced ? false : { opacity: 0, scale: 0.97 }}
        animate={reduced ? undefined : { opacity: 1, scale: 1 }}
        transition={reduced ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 340 }}
        onClick={(event) => event.stopPropagation()}
        className="relative z-10 flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-[#FAFAF9] shadow-[0_24px_80px_-24px_rgba(9,9,11,0.45)] outline-none"
      >
        <div className="flex flex-col gap-3 border-b border-zinc-200/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div
            role="tablist"
            aria-label="Tipo de contexto"
            className="inline-flex shrink-0 self-start rounded-full bg-zinc-100 p-1 sm:self-auto"
          >
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:outline-none",
                  tab === entry.id
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
              <input
                ref={searchRef}
                type="search"
                data-bare-input=""
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar acción o índice…"
                aria-label="Buscar acción o índice"
                className="h-10 w-full rounded-full border border-zinc-200 bg-white pr-3 pl-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 shrink-0 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:outline-none"
            >
              Listo
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <section aria-labelledby="context-portfolio-heading">
            <h3
              id="context-portfolio-heading"
              className="px-1 pb-2 text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase"
            >
              Tu cartera
            </h3>

            {portfolio.isPending ? (
              <ul className="space-y-1">
                <RowSkeleton />
                <RowSkeleton />
                <RowSkeleton />
              </ul>
            ) : portfolio.isError ? (
              <EmptyMessage>No pudimos cargar tu cartera.</EmptyMessage>
            ) : (
              <ul className="space-y-1">
                <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-zinc-100/70">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                    <WalletIcon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900">
                      Toda mi cartera
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      Resumen completo de tus posiciones
                    </span>
                  </span>
                  {typeof portfolioTotal === "number" && Number.isFinite(portfolioTotal) ? (
                    <span className="shrink-0 text-right text-xs">
                      <span className="block font-semibold text-zinc-900 tabular-nums">
                        {formatMoney(portfolioTotal, "USD")}
                      </span>
                      <span className="block text-zinc-500">Total</span>
                    </span>
                  ) : null}
                  <AddControl
                    item={PORTFOLIO_ITEM}
                    added={portfolioItemAdded}
                    atLimit={portfolioAtLimit}
                    onToggle={onToggle}
                  />
                </li>

                {positions.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-zinc-500">Aún no tienes posiciones</li>
                ) : (
                  positions.map((position) => {
                    const ticker = tickerBySymbol.get(position.symbol.toLowerCase());
                    const name = ticker?.name ?? position.symbol;
                    const item: ContextItem = {
                      id: `stock:${position.symbol}`,
                      kind: "stock",
                      symbol: position.symbol,
                      name,
                    };
                    const added = isInContext(selected, item.id);
                    const atLimit = !added && selected.length >= MAX_CONTEXT_ITEMS;

                    return (
                      <li
                        key={position.symbol}
                        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-zinc-100/70"
                      >
                        <TickerLogo
                          symbol={position.symbol}
                          name={name}
                          logoUrl={ticker?.logo ?? null}
                          size={36}
                          decorative
                          loading="lazy"
                          sizes="40px"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-zinc-900">
                            {name}
                          </span>
                          <span className="block truncate text-xs text-zinc-500">
                            {position.symbol}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span className="block font-semibold text-zinc-900 tabular-nums">
                            {formatMoney(position.valueUsd, "USD")}
                          </span>
                          <span className="block text-zinc-500 tabular-nums">
                            {formatShares(position.shares)}
                          </span>
                        </span>
                        <AddControl
                          item={item}
                          added={added}
                          atLimit={atLimit}
                          onToggle={onToggle}
                        />
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </section>

          <section aria-labelledby="context-featured-heading" className="mt-6">
            <h3
              id="context-featured-heading"
              className="px-1 pb-2 text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase"
            >
              {searchMode ? "Resultados" : "Destacados"}
            </h3>

            {renderFeatured()}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200/70 px-5 py-3 text-xs text-zinc-500">
          <span>
            {selected.length} de {MAX_CONTEXT_ITEMS} en contexto
          </span>
          <span>Máximo {MAX_CONTEXT_ITEMS} elementos</span>
        </div>
      </motion.div>
    </div>
  );

  if (!mounted) return dialog;

  return createPortal(dialog, document.body);
}

/**
 * Selector de contexto del asistente. Sin `open` no renderiza nada: así el SSR
 * con el modal cerrado no toca hooks de datos ni necesita QueryClient.
 */
export function ContextPicker({ open, onOpenChange, selected, onToggle }: ContextPickerProps) {
  if (!open) return null;
  return (
    <ContextPickerDialog
      onOpenChange={onOpenChange}
      selected={selected}
      onToggle={onToggle}
    />
  );
}

export default ContextPicker;
