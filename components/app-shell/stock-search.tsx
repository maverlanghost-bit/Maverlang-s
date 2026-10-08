"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Badge } from "@/components/ui/badge";
import { IconClose, IconSearch } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { getPrices, searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useFx } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import type { Currency, Quote } from "@/lib/types";

const SEARCH_MS = 300;
const PAGE_SIZE = 20;

type Box = { top: number; left: number; width: number; maxHeight: number };

function subscribeMounted() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(subscribeMounted, () => true, () => false);
}

/** El menú sale al lado del botón, por fuera de la barra. Si no cabe, queda debajo. */
function placeMenu(anchor: HTMLElement, viewport: { width: number; height: number }): Box {
  const rect = anchor.getBoundingClientRect();
  const aside = anchor.closest("aside");
  const edge = aside ? Math.max(rect.right, aside.getBoundingClientRect().right) : rect.right;
  const margin = 12;
  const width = Math.min(360, viewport.width - margin * 2);
  if (viewport.width < 1024) {
    const top = Math.max(margin, Math.min(rect.bottom + 8, viewport.height - margin - 240));
    return {
      top,
      left: margin,
      width: viewport.width - margin * 2,
      maxHeight: Math.max(240, viewport.height - top - margin),
    };
  }
  const fitsRight = edge + 8 + width <= viewport.width - margin;
  if (fitsRight) {
    const maxHeight = Math.min(520, viewport.height - margin * 2);
    const top = Math.max(margin, Math.min(rect.top, viewport.height - margin - maxHeight));
    return { top, left: edge + 8, width, maxHeight: Math.min(maxHeight, viewport.height - top - margin) };
  }
  const top = Math.max(margin, rect.bottom + 8);
  const left = Math.max(margin, Math.min(edge - width, viewport.width - margin - width));
  return { top, left, width, maxHeight: Math.max(240, viewport.height - top - margin) };
}

type SearchApi = {
  open: boolean;
  toggleFrom: (anchor: HTMLElement) => void;
};

const StockSearchContext = createContext<SearchApi | null>(null);

function visibleTrigger(): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>("[data-stock-search-trigger]");
  for (const node of nodes) {
    if (node.getClientRects().length > 0) return node;
  }
  return null;
}

export function StockSearchRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  function dismiss() {
    setOpen(false);
    anchorRef.current?.focus();
  }

  function toggleFrom(anchor: HTMLElement) {
    anchorRef.current = anchor;
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (open) return;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      const trigger = visibleTrigger();
      if (!trigger) return;
      event.preventDefault();
      anchorRef.current = trigger;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <StockSearchContext.Provider value={{ open, toggleFrom }}>
      {children}
      {open ? <StockSearchPanel anchorRef={anchorRef} onClose={() => setOpen(false)} onDismiss={dismiss} /> : null}
    </StockSearchContext.Provider>
  );
}

export function StockSearchButton({
  variant = "nav",
  collapsed = false,
}: {
  variant?: "nav" | "icon";
  collapsed?: boolean;
}) {
  const api = useContext(StockSearchContext);
  const { t } = useT();
  const ref = useRef<HTMLButtonElement>(null);
  if (!api) return null;

  function onClick() {
    const anchor = ref.current;
    if (anchor) api?.toggleFrom(anchor);
  }

  if (variant === "icon") {
    return (
      <button
        ref={ref}
        type="button"
        data-stock-search-trigger=""
        aria-label={t.shell.search}
        aria-expanded={api.open}
        aria-haspopup="dialog"
        onClick={onClick}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-body hover:bg-surface-2"
      >
        <IconSearch />
      </button>
    );
  }

  const button = (
    <button
      ref={ref}
      type="button"
      data-stock-search-trigger=""
      aria-label={collapsed ? t.shell.search : undefined}
      aria-expanded={api.open}
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl text-sm transition duration-200 ease-spring active:scale-[0.98]",
        api.open ? "bg-surface-2 font-medium text-fg" : "text-fg-body hover:bg-surface-2",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center">
        <IconSearch className="size-4" />
      </span>
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-200 ease-spring",
          collapsed ? "max-w-0 opacity-0" : "max-w-44 opacity-100",
        )}
      >
        {t.shell.search}
      </span>
    </button>
  );

  return collapsed ? <Tooltip content={t.shell.search}>{button}</Tooltip> : button;
}

function StockSearchPanel({
  anchorRef,
  onClose,
  onDismiss,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const { t, currency } = useT();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [needle, setNeedle] = useState("");
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const mounted = useMounted();
  const focused = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setNeedle(draft.trim());
      setActive(0);
    }, SEARCH_MS);
    return () => window.clearTimeout(id);
  }, [draft]);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const next = placeMenu(anchor, { width: window.innerWidth, height: window.innerHeight });
      setBox((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    if (!mounted || !box || focused.current) return;
    focused.current = true;
    inputRef.current?.focus();
  }, [box, mounted]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-stock-search-trigger]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const search = useQuery({
    queryKey: ["market-search", needle, "all", 1, PAGE_SIZE, "liquidity"] as const,
    queryFn: () => searchMarket({ q: needle, page: 1, pageSize: PAGE_SIZE, sort: "liquidity" }),
    enabled: needle.length > 0,
    staleTime: 30_000,
  });
  const items: MarketSearchItem[] = needle ? (search.data?.items ?? []) : [];
  const symbols = items.map((item) => item.symbol);
  const prices = useQuery({
    queryKey: ["prices", [...symbols].sort()] as const,
    queryFn: () => getPrices(symbols),
    enabled: symbols.length > 0,
    staleTime: 15_000,
  });
  const fx = useFx();
  const quotes = new Map<string, Quote>();
  for (const quote of prices.data ?? []) quotes.set(quote.symbol, quote);

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shown: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const rows = items.map((item) => {
    const quote = quotes.get(item.symbol);
    const price = quote ? displayPrice(quote.priceUsd, shown, fxKnown ? rate : undefined) : null;
    const change = quote && Number.isFinite(quote.change24hPct) ? quote.change24hPct : null;
    return { item, price, change };
  });
  const activeIndex = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);
  const waiting = needle.length > 0 && search.isPending;
  const failed = needle.length > 0 && search.isError && rows.length === 0;

  useEffect(() => {
    if (rows.length === 0) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, rows.length]);

  function openSymbol(symbol: string) {
    onClose();
    router.push(`/app/accion/${encodeURIComponent(symbol)}`);
  }

  if (!mounted || !box) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t.market.searchLabel}
      className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-float"
      style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDismiss();
        }
      }}
    >
      <form
        role="search"
        className="flex items-center gap-2 border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const row = rows[activeIndex];
          if (row) openSymbol(row.item.symbol);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t.market.searchLabel}
        </label>
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <Input
            ref={inputRef}
            id={inputId}
            type="search"
            value={draft}
            placeholder={t.market.searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            role="combobox"
            aria-expanded={needle.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows.length > 0 ? `${listId}-${activeIndex}` : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => (rows.length === 0 ? 0 : (value + 1) % rows.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => (rows.length === 0 ? 0 : (value - 1 + rows.length) % rows.length));
              }
            }}
            className={draft ? "pr-3 pl-10" : "pr-12 pl-10"}
          />
          {draft ? null : (
            <kbd
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-xs border border-border px-1.5 font-mono text-[11px] text-fg-muted lg:inline"
              aria-hidden
            >
              /
            </kbd>
          )}
        </div>
        <button
          type="button"
          aria-label={t.shell.searchClose}
          onClick={onDismiss}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <IconClose />
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {needle.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">{t.market.searchIdle}</p>
        ) : null}
        {waiting ? (
          <div className="flex flex-col gap-1 p-2" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t.states.loading}</span>
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {failed ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8">
            <p className="text-center text-sm text-fg-muted">{t.market.searchError}</p>
            <button
              type="button"
              onClick={() => void search.refetch()}
              className="flex h-11 cursor-pointer items-center rounded-full bg-surface-2 px-4 text-sm text-fg"
            >
              {t.states.retry}
            </button>
          </div>
        ) : null}
        {!waiting && !failed && needle.length > 0 && rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">{t.market.suggestEmpty}</p>
        ) : null}
        {rows.length > 0 ? (
          <ul role="listbox" id={listId} aria-label={t.market.suggestLabel} className="p-1">
            {rows.map((row, index) => {
              const selected = index === activeIndex;
              return (
                <li key={row.item.symbol} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={selected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => openSymbol(row.item.symbol)}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition duration-[140ms] ease-spring",
                      selected ? "bg-surface-3" : "hover:bg-surface-2",
                    )}
                  >
                    <TickerLogo
                      symbol={row.item.symbol}
                      name={row.item.name}
                      logoUrl={row.item.logoUrl}
                      size={36}
                      decorative
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{row.item.name}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <span className="num truncate text-xs text-fg-muted">{row.item.symbol}</span>
                        {row.item.underReview ? (
                          <Badge tone="warn" className="shrink-0 px-1.5 py-0">
                            {t.market.underReview}
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {row.price === null ? (
                        <Skeleton className="h-4 w-16" />
                      ) : (
                        <span className="num text-sm text-fg">{formatMoney(row.price, shown)}</span>
                      )}
                      {row.change === null ? null : <ChangeBadge value={row.change} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {search.data?.hasMore && rows.length > 0 ? (
          <p className="px-4 py-3 text-center text-xs text-fg-muted">{t.market.searchMore}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
