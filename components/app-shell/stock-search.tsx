"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IconChart,
  IconClose,
  IconGear,
  IconPortfolio,
  IconSearch,
  IconStar,
  IconWallet,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { ENABLED_TICKERS } from "@/config/tickers";
import { getPrices, searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { CRYPTO_ASSETS, type CryptoAsset } from "@/lib/catalog/crypto";
import { LST_ASSETS, type LstAsset } from "@/lib/catalog/lst";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { priceQueryKey, useFx } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice, fold, matchesQuery } from "@/lib/market/browse";
import type { Currency, Quote, Ticker } from "@/lib/types";

const SEARCH_MS = 220;
const PAGE_SIZE = 20;
const MAX_CRYPTO_MATCHES = 6;
const MAX_EARN_MATCHES = 6;
const MAX_INSTANT_STOCKS = 8;

const FEATURED_STOCK_SYMBOLS = ["NVDAx", "AAPLx", "TSLAx", "MSFTx", "SPYx"] as const;
const FEATURED_CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL"] as const;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const KBD_CLASS =
  "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-1 px-1.5 font-mono text-[10px] leading-none text-fg-muted";

function subscribeMounted() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(subscribeMounted, () => true, () => false);
}

/** Dispara el buscador unificado desde cualquier módulo cliente (equivalente a ⌘K / Ctrl+K). */
export function openStockSearch() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("maverlang:open-stock-search"));
  }
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest('[contenteditable="true"]') !== null;
}

export function StockSearchRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    setOpen(false);
    anchorRef.current?.focus();
  }, []);

  const openFromShortcut = useCallback(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    anchorRef.current = active && active !== document.body ? active : visibleTrigger();
    setOpen(true);
  }, []);

  const toggleFrom = useCallback((anchor: HTMLElement) => {
    anchorRef.current = anchor;
    setOpen((current) => !current);
  }, []);

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          dismiss();
        } else {
          openFromShortcut();
        }
        return;
      }

      if (open) return;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      if (isEditableTarget(event.target)) return;

      const trigger = visibleTrigger();
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      anchorRef.current = trigger ?? (active && active !== document.body ? active : null);
      event.preventDefault();
      setOpen(true);
    };

    const onOpenEvent = () => {
      if (!open) openFromShortcut();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("maverlang:open-command-palette", onOpenEvent);
    window.addEventListener("maverlang:open-stock-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("maverlang:open-command-palette", onOpenEvent);
      window.removeEventListener("maverlang:open-stock-search", onOpenEvent);
    };
  }, [open, dismiss, openFromShortcut]);

  return (
    <StockSearchContext.Provider value={{ open, toggleFrom }}>
      {children}
      {open ? <StockSearchPanel onClose={() => setOpen(false)} onDismiss={dismiss} /> : null}
    </StockSearchContext.Provider>
  );
}

export function StockSearchButton({
  variant = "nav",
  collapsed = false,
  "aria-describedby": ariaDescribedBy,
  title,
}: {
  variant?: "nav" | "icon" | "chip";
  collapsed?: boolean;
  "aria-describedby"?: string;
  title?: string;
}) {
  const api = useContext(StockSearchContext);
  const { t } = useT();
  const ref = useRef<HTMLButtonElement>(null);
  if (!api) return null;

  function onClick() {
    const anchor = ref.current;
    if (anchor) api?.toggleFrom(anchor);
  }

  if (variant === "icon" || variant === "chip") {
    return (
      <button
        ref={ref}
        type="button"
        data-stock-search-trigger=""
        aria-label={t.shell.search}
        aria-expanded={api.open}
        aria-haspopup="dialog"
        aria-describedby={ariaDescribedBy}
        title={title}
        onClick={onClick}
        className={
          variant === "chip"
            ? "liquid-glass--chip"
            : "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-fg/[0.05] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        }
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
      aria-describedby={ariaDescribedBy}
      title={title}
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-center rounded-lg text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        collapsed
          ? "mx-auto size-11 justify-center text-fg-muted hover:bg-fg/[0.055] hover:text-fg"
          : "min-h-11 w-full gap-2 border border-border-control bg-bg px-3 text-sm text-fg-muted hover:border-fg/40 hover:text-fg",
        api.open && !collapsed && "border-fg text-fg",
      )}
    >
      <IconSearch className="size-4 shrink-0" />
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{t.market.searchLabel}</span>
      {collapsed ? null : (
        <kbd
          aria-hidden
          className="hidden shrink-0 rounded border border-border px-1 py-0.5 font-mono text-[11px] leading-none text-fg-muted lg:inline"
        >
          /
        </kbd>
      )}
    </button>
  );

  return collapsed ? <Tooltip content={t.shell.search} side="right">{button}</Tooltip> : button;
}

type StockRowItem = {
  symbol: string;
  name: string;
  category: Ticker["category"];
  logoUrl: string | null;
  underReview: boolean;
};

type QuickCommandId =
  | "market"
  | "portfolio"
  | "assistant"
  | "wallet"
  | "favorites"
  | "crypto"
  | "earn"
  | "settings";

type QuickCommand = {
  id: QuickCommandId;
  href: string;
  label: string;
  hint: string;
  keywords: string;
};

type SearchOption =
  | { kind: "stock"; id: string; href: string; stock: StockRowItem; price: number | null; change: number | null }
  | { kind: "crypto"; id: string; href: string; asset: CryptoAsset; price: number | null; change: number | null }
  | { kind: "earn"; id: string; href: string; asset: LstAsset; price: number | null }
  | { kind: "command"; id: string; href: string; command: QuickCommand };

const usd4 = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const usd6 = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const usd8 = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

function formatSearchPrice(value: number, currency: Currency): string {
  if (currency === "CLP" || value >= 1) return formatMoney(value, currency);
  if (value >= 0.01) return usd4.format(value);
  if (value >= 0.0001) return usd6.format(value);
  return usd8.format(value);
}

function tickerToRow(ticker: Ticker): StockRowItem {
  return {
    symbol: ticker.symbol,
    name: ticker.name,
    category: ticker.category,
    logoUrl: ticker.logo,
    underReview: false,
  };
}

function marketItemToRow(item: MarketSearchItem): StockRowItem {
  return {
    symbol: item.symbol,
    name: item.name,
    category: item.category,
    logoUrl: item.logoUrl,
    underReview: item.underReview,
  };
}

function deduplicateStocks(list: readonly StockRowItem[]): StockRowItem[] {
  const seen = new Set<string>();
  const out: StockRowItem[] = [];
  for (const item of list) {
    const key = item.symbol.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const FEATURED_STOCKS: StockRowItem[] = (() => {
  const bySymbol = new Map<string, Ticker>(ENABLED_TICKERS.map((t) => [t.symbol, t]));
  const picks: StockRowItem[] = [];
  for (const sym of FEATURED_STOCK_SYMBOLS) {
    const match = bySymbol.get(sym);
    if (match) picks.push(tickerToRow(match));
  }
  if (picks.length < 5) {
    for (const ticker of ENABLED_TICKERS) {
      if (picks.length >= 5) break;
      if (!picks.some((p) => p.symbol === ticker.symbol)) picks.push(tickerToRow(ticker));
    }
  }
  return picks;
})();

const FEATURED_CRYPTO: CryptoAsset[] = (() => {
  const bySymbol = new Map<string, CryptoAsset>(CRYPTO_ASSETS.map((a) => [a.symbol, a]));
  const picks: CryptoAsset[] = [];
  for (const sym of FEATURED_CRYPTO_SYMBOLS) {
    const match = bySymbol.get(sym);
    if (match) picks.push(match);
  }
  return picks;
})();

function getQuickCommands(language: "es-CL" | "en"): QuickCommand[] {
  if (language === "en") {
    return [
      { id: "market", href: "/app", label: "Market", hint: "Tokenized U.S. stocks 24/7", keywords: "stocks etfs home" },
      { id: "portfolio", href: "/app/cartera", label: "Portfolio", hint: "Positions and orders", keywords: "holdings history orders" },
      { id: "assistant", href: "/app/asistente", label: "AI Assistant", hint: "Ask Maverlang AI", keywords: "ai chat assistant" },
      { id: "wallet", href: "/app/billetera", label: "Wallet", hint: "USDC balance, deposit & send", keywords: "usdc balance deposit withdraw send" },
      { id: "favorites", href: "/app/favoritas", label: "Favorites", hint: "Saved stocks", keywords: "watchlist starred" },
      { id: "crypto", href: "/app/cripto", label: "Crypto", hint: "Solana tokens, dollars & gold", keywords: "bitcoin solana crypto tokens" },
      { id: "earn", href: "/app/ganar", label: "Earn", hint: "Liquid staking & yield", keywords: "staking lst apy yield" },
      { id: "settings", href: "/app/ajustes", label: "Currency & language settings", hint: "USD / CLP and preferences", keywords: "currency language clp usd settings" },
    ];
  }
  return [
    { id: "market", href: "/app", label: "Mercado", hint: "Acciones de EE.UU. 24/7", keywords: "acciones etfs inicio" },
    { id: "portfolio", href: "/app/cartera", label: "Cartera", hint: "Posiciones y órdenes", keywords: "portafolio historial ordenes" },
    { id: "assistant", href: "/app/asistente", label: "Asistente AI", hint: "Preguntar a Maverlang AI", keywords: "ia chat asistente" },
    { id: "wallet", href: "/app/billetera", label: "Billetera", hint: "Saldo USDC, depósitos y retiros", keywords: "saldo usdc depositar retirar enviar" },
    { id: "favorites", href: "/app/favoritas", label: "Favoritas", hint: "Acciones guardadas", keywords: "watchlist estrella" },
    { id: "crypto", href: "/app/cripto", label: "Cripto", hint: "Tokens en Solana, dólar y oro", keywords: "criptomonedas bitcoin solana dolares oro" },
    { id: "earn", href: "/app/ganar", label: "Ganar", hint: "Staking líquido y dólares", keywords: "staking lst apy rendimiento" },
    { id: "settings", href: "/app/ajustes", label: "Ajustes de moneda e idioma", hint: "USD / CLP y preferencias", keywords: "configuracion moneda idioma clp usd" },
  ];
}

function CommandIcon({ id }: { id: QuickCommandId }) {
  switch (id) {
    case "market":
      return <IconChart className="size-4" />;
    case "portfolio":
      return <IconPortfolio className="size-4" />;
    case "wallet":
      return <IconWallet className="size-4" />;
    case "favorites":
      return <IconStar className="size-4" />;
    case "settings":
      return <IconGear className="size-4" />;
    case "assistant":
      return (
        <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
          <path
            d="M2.8 3.6h10.4A1.2 1.2 0 0 1 14.4 4.8v4.7a1.2 1.2 0 0 1-1.2 1.2H7.2L4.4 13.2V10.7H2.8a1.2 1.2 0 0 1-1.2-1.2V4.8a1.2 1.2 0 0 1 1.2-1.2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "crypto":
      return (
        <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 5.75h2.25a1.25 1.25 0 0 1 0 2.5H6.5m0 0h2.5a1.25 1.25 0 0 1 0 2.5H6.5m0-5v5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "earn":
      return (
        <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
          <path d="M3 11.5 6.5 8l2.5 2.5L13 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 5.5h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function AssetMonogram({ symbol }: { symbol: string }) {
  const letters = symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || symbol.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-mono leading-none font-medium text-fg select-none",
        letters.length >= 3 ? "text-[10px]" : "text-xs",
      )}
    >
      {letters}
    </span>
  );
}

function ChevronRight({ selected }: { selected: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 text-fg-muted transition-opacity duration-100",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-60",
      )}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function cryptoGroupLabel(group: CryptoAsset["group"], language: "es-CL" | "en"): string {
  if (language === "en") {
    return group === "dollar" ? "Dollar" : group === "gold" ? "Gold" : "Crypto";
  }
  return group === "dollar" ? "Dólar" : group === "gold" ? "Oro" : "Cripto";
}

function StockSearchPanel({
  onClose,
  onDismiss,
}: {
  onClose: () => void;
  onDismiss: () => void;
}) {
  const { t, language, currency } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropPressRef = useRef(false);
  const scrollActiveRef = useRef(false);

  const listId = useId();
  const inputId = useId();
  const groupStocksId = useId();
  const groupCryptoId = useId();
  const groupEarnId = useId();
  const groupCommandsId = useId();

  const [draft, setDraft] = useState("");
  const [needle, setNeedle] = useState("");
  const [active, setActive] = useState(0);
  const mounted = useMounted();

  const trimmedDraft = draft.trim();
  const foldedDraft = useMemo(() => fold(trimmedDraft), [trimmedDraft]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setNeedle(trimmedDraft);
    }, SEARCH_MS);
    return () => window.clearTimeout(id);
  }, [trimmedDraft]);

  /** Bloquea el scroll del fondo mientras el modal está abierto, compensando la barra. */
  useEffect(() => {
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const overflow = body.style.overflow;
    const paddingRight = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }, []);

  /** Enfoca el campo al abrir el modal en el cliente. */
  useEffect(() => {
    if (!mounted) return;
    inputRef.current?.focus();
  }, [mounted]);

  /** Escape cierra y devuelve el foco; Tab y Shift+Tab quedan atrapados dentro del diálogo. */
  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el.getClientRects().length > 0,
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const activeEl = document.activeElement;
      if (!panel.contains(activeEl)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, onDismiss]);

  const search = useQuery({
    queryKey: ["market-search", needle, "all", 1, PAGE_SIZE, "liquidity"] as const,
    queryFn: () => searchMarket({ q: needle, page: 1, pageSize: PAGE_SIZE, sort: "liquidity" }),
    enabled: needle.length > 0,
    staleTime: 30_000,
  });

  const instantStocks = useMemo(() => {
    if (!trimmedDraft) return [];
    return deduplicateStocks(
      ENABLED_TICKERS.filter((ticker) => matchesQuery(ticker, trimmedDraft))
        .slice(0, MAX_INSTANT_STOCKS)
        .map(tickerToRow),
    );
  }, [trimmedDraft]);

  const stockItems: StockRowItem[] = useMemo(() => {
    if (!trimmedDraft) return isAppRoute ? FEATURED_STOCKS : [];
    if (trimmedDraft === needle && search.isSuccess) {
      return deduplicateStocks(search.data.items.map(marketItemToRow));
    }
    if (trimmedDraft === needle && search.isError) {
      return [];
    }
    return instantStocks;
  }, [trimmedDraft, needle, isAppRoute, search.isSuccess, search.isError, search.data, instantStocks]);

  const cryptoItems: CryptoAsset[] = useMemo(() => {
    if (!isAppRoute) return [];
    if (!foldedDraft) return FEATURED_CRYPTO;
    return CRYPTO_ASSETS.filter((asset) => {
      const groupWord = cryptoGroupLabel(asset.group, language);
      return [asset.symbol, asset.name, asset.originLabel, groupWord].some((field) =>
        fold(field).includes(foldedDraft),
      );
    }).slice(0, MAX_CRYPTO_MATCHES);
  }, [isAppRoute, foldedDraft, language]);

  const earnItems: LstAsset[] = useMemo(() => {
    if (!isAppRoute || !foldedDraft) return [];
    return LST_ASSETS.filter((asset) =>
      [asset.symbol, asset.name, asset.issuerName, "staking lst"].some((field) =>
        fold(field).includes(foldedDraft),
      ),
    ).slice(0, MAX_EARN_MATCHES);
  }, [isAppRoute, foldedDraft]);

  const commandItems: QuickCommand[] = useMemo(() => {
    if (!isAppRoute) return [];
    const all = getQuickCommands(language);
    if (!foldedDraft) return all;
    return all.filter((cmd) => fold(`${cmd.label} ${cmd.hint} ${cmd.keywords}`).includes(foldedDraft));
  }, [isAppRoute, language, foldedDraft]);

  const priceSymbols = useMemo(() => {
    const list: string[] = [];
    for (const s of stockItems) list.push(s.symbol);
    for (const c of cryptoItems) {
      if (c.decimals !== null) list.push(c.symbol);
    }
    for (const e of earnItems) list.push(e.symbol);
    return priceQueryKey(list);
  }, [stockItems, cryptoItems, earnItems]);

  const prices = useQuery({
    queryKey: ["prices", priceSymbols] as const,
    queryFn: () => getPrices(priceSymbols),
    enabled: priceSymbols.length > 0,
    staleTime: 15_000,
  });

  const fx = useFx();

  const quotes = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of prices.data ?? []) {
      map.set(quote.symbol.toLowerCase(), quote);
    }
    return map;
  }, [prices.data]);

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shown: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";

  const { stockOptions, cryptoOptions, earnOptions, commandOptions, flatOptions } = useMemo(() => {
    const stocks: Extract<SearchOption, { kind: "stock" }>[] = stockItems.map((stock) => {
      const quote = quotes.get(stock.symbol.toLowerCase());
      const price = quote ? displayPrice(quote.priceUsd, shown, fxKnown ? rate : undefined) : null;
      const change = quote && Number.isFinite(quote.change24hPct) ? quote.change24hPct : null;
      return {
        kind: "stock",
        id: `stock-${stock.symbol}`,
        href: `/app/accion/${encodeURIComponent(stock.symbol)}`,
        stock,
        price,
        change,
      };
    });

    const cryptos: Extract<SearchOption, { kind: "crypto" }>[] = cryptoItems.map((asset) => {
      const quote = asset.decimals !== null ? quotes.get(asset.symbol.toLowerCase()) : undefined;
      const liveQuote =
        quote && quote.source === "jupiter" && quote.reference !== true && Number.isFinite(quote.priceUsd) && quote.priceUsd > 0
          ? quote
          : undefined;
      const price = liveQuote ? displayPrice(liveQuote.priceUsd, shown, fxKnown ? rate : undefined) : null;
      const change = liveQuote && Number.isFinite(liveQuote.change24hPct) ? liveQuote.change24hPct : null;
      return {
        kind: "crypto",
        id: `crypto-${asset.symbol}`,
        href: `/app/cripto/${encodeURIComponent(asset.symbol)}`,
        asset,
        price,
        change,
      };
    });

    const earns: Extract<SearchOption, { kind: "earn" }>[] = earnItems.map((asset) => {
      const quote = quotes.get(asset.symbol.toLowerCase());
      const liveQuote =
        quote && quote.source === "jupiter" && quote.reference !== true && Number.isFinite(quote.priceUsd) && quote.priceUsd > 0
          ? quote
          : undefined;
      const price = liveQuote ? displayPrice(liveQuote.priceUsd, shown, fxKnown ? rate : undefined) : null;
      return {
        kind: "earn",
        id: `earn-${asset.symbol}`,
        href: "/app/ganar",
        asset,
        price,
      };
    });

    const commands: Extract<SearchOption, { kind: "command" }>[] = commandItems.map((command) => ({
      kind: "command",
      id: `cmd-${command.id}`,
      href: command.href,
      command,
    }));

    return {
      stockOptions: stocks,
      cryptoOptions: cryptos,
      earnOptions: earns,
      commandOptions: commands,
      flatOptions: [...stocks, ...cryptos, ...earns, ...commands] as SearchOption[],
    };
  }, [stockItems, cryptoItems, earnItems, commandItems, quotes, shown, fxKnown, rate]);

  const totalOptions = flatOptions.length;
  const activeIndex = totalOptions === 0 ? 0 : Math.min(active, totalOptions - 1);
  const hasOptions = totalOptions > 0;
  const stockSearchWaiting = trimmedDraft.length > 0 && (trimmedDraft !== needle || search.isPending);
  const stockSearchFailed = trimmedDraft.length > 0 && trimmedDraft === needle && search.isError && stockOptions.length === 0;
  const showFullSkeleton = stockSearchWaiting && !hasOptions;
  const showFullError = stockSearchFailed && !hasOptions;
  const showEmpty = trimmedDraft.length > 0 && !stockSearchWaiting && !stockSearchFailed && !hasOptions;
  const showPublicIdle = !isAppRoute && trimmedDraft.length === 0;

  useEffect(() => {
    if (!scrollActiveRef.current || totalOptions === 0) return;
    scrollActiveRef.current = false;
    document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, totalOptions]);

  function navigateTo(href: string) {
    onClose();
    router.push(href);
  }

  function moveActive(next: number) {
    scrollActiveRef.current = true;
    setActive(next);
  }

  if (!mounted) return null;

  const placeholder = isAppRoute
    ? language === "en"
      ? "Search stocks, crypto, or jump to…"
      : "Buscar acciones, cripto o ir a…"
    : t.market.searchPlaceholder;

  const stocksOffset = 0;
  const cryptoOffset = stockOptions.length;
  const earnOffset = cryptoOffset + cryptoOptions.length;
  const commandOffset = earnOffset + earnOptions.length;

  const stocksHeading = language === "en" ? "Stocks" : "Acciones";
  const cryptoHeading = language === "en" ? "Crypto" : "Cripto";
  const earnHeading = language === "en" ? "Earn" : "Ganar";
  const commandsHeading = language === "en" ? "Jump to" : "Ir a";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-3 pt-[max(3.5rem,10dvh)] pb-4 backdrop-blur-[2px] sm:px-4"
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.market.searchLabel}
        className="animate-pop-in flex max-h-[min(32rem,76dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-float"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLButtonElement) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (totalOptions > 0) moveActive((activeIndex + 1) % totalOptions);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (totalOptions > 0) moveActive((activeIndex - 1 + totalOptions) % totalOptions);
          } else if (event.key === "Home") {
            event.preventDefault();
            if (totalOptions > 0) moveActive(0);
          } else if (event.key === "End") {
            event.preventDefault();
            if (totalOptions > 0) moveActive(totalOptions - 1);
          } else if (event.key === "Enter" && totalOptions > 0) {
            event.preventDefault();
            const chosen = flatOptions[activeIndex];
            if (chosen) navigateTo(chosen.href);
          }
        }}
      >
        <form
          role="search"
          className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            const chosen = flatOptions[activeIndex];
            if (chosen) navigateTo(chosen.href);
          }}
        >
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border-control bg-bg px-3 transition-colors duration-150 focus-within:border-fg">
            <IconSearch className="size-4 shrink-0 text-fg-muted" />
            <Input
              ref={inputRef}
              id={inputId}
              type="search"
              value={draft}
              placeholder={placeholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              data-bare-input=""
              role="combobox"
              aria-label={t.market.searchLabel}
              aria-expanded={hasOptions}
              aria-controls={hasOptions ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={hasOptions ? `${listId}-opt-${activeIndex}` : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setActive(0);
              }}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-base outline-none focus-visible:border-0"
            />
            {draft ? null : (
              <kbd aria-hidden className={cn(KBD_CLASS, "pointer-events-none hidden shrink-0 sm:inline-flex")}>
                ⌘K
              </kbd>
            )}
          </div>
          <button
            type="button"
            aria-label={t.shell.searchClose}
            onClick={onDismiss}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <IconClose />
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
          {showPublicIdle ? (
            <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
              <IconSearch className="size-5 text-fg-muted" />
              <p className="text-sm text-fg-muted">{t.market.searchIdle}</p>
            </div>
          ) : null}

          {showFullSkeleton ? (
            <div className="flex flex-col gap-0.5" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">{t.states.loading}</span>
              {[0, 1, 2, 3].map((key) => (
                <div key={key} className="flex min-h-12 items-center gap-3 rounded-xl px-2.5 py-2">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-3.5 w-14" />
                </div>
              ))}
            </div>
          ) : null}

          {showFullError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10">
              <p className="text-center text-sm text-fg-muted">{t.market.searchError}</p>
              <Button variant="secondary" size="sm" onClick={() => void search.refetch()}>
                {t.states.retry}
              </Button>
            </div>
          ) : null}

          {showEmpty ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <IconSearch className="size-5 text-fg-muted" />
              <p className="text-sm text-fg-muted">{t.market.suggestEmpty}</p>
            </div>
          ) : null}

          {hasOptions ? (
            <div role="listbox" id={listId} aria-label={t.market.suggestLabel} className="flex flex-col gap-2 pb-1">
              {stockOptions.length > 0 ? (
                <div role="group" aria-labelledby={groupStocksId} className="flex flex-col gap-0.5">
                  <div
                    id={groupStocksId}
                    role="presentation"
                    className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted"
                  >
                    {stocksHeading}
                  </div>
                  {stockOptions.map((opt, idx) => {
                    const globalIdx = stocksOffset + idx;
                    const selected = globalIdx === activeIndex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        id={`${listId}-opt-${globalIdx}`}
                        aria-selected={selected}
                        onMouseEnter={() => setActive(globalIdx)}
                        onClick={() => navigateTo(opt.href)}
                        className={cn(
                          "group grid min-h-12 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100",
                          selected ? "bg-surface-2" : "hover:bg-surface-1",
                        )}
                      >
                        <TickerLogo
                          symbol={opt.stock.symbol}
                          name={opt.stock.name}
                          logoUrl={opt.stock.logoUrl}
                          size={32}
                          decorative
                          loading="lazy"
                          sizes="40px"
                        />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium text-fg">{opt.stock.name}</span>
                            {opt.stock.underReview ? (
                              <Badge tone="warn" className="shrink-0 px-1.5 py-0 text-[11px]">
                                {t.market.underReview}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <span className="num shrink-0 text-xs uppercase tracking-[0.03em] text-fg-muted">
                              {opt.stock.symbol}
                            </span>
                            <span aria-hidden className="text-xs text-fg-muted">
                              ·
                            </span>
                            <span className="truncate text-xs text-fg-muted">
                              {t.market[opt.stock.category]}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          {opt.price === null ? (
                            prices.isPending ? <Skeleton className="h-3.5 w-16" /> : null
                          ) : (
                            <span className="num text-[13px] leading-5 text-fg tabular-nums">
                              {formatSearchPrice(opt.price, shown)}
                            </span>
                          )}
                          {opt.change === null ? null : <ChangeBadge value={opt.change} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {cryptoOptions.length > 0 ? (
                <div role="group" aria-labelledby={groupCryptoId} className="flex flex-col gap-0.5">
                  <div
                    id={groupCryptoId}
                    role="presentation"
                    className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted"
                  >
                    {cryptoHeading}
                  </div>
                  {cryptoOptions.map((opt, idx) => {
                    const globalIdx = cryptoOffset + idx;
                    const selected = globalIdx === activeIndex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        id={`${listId}-opt-${globalIdx}`}
                        aria-selected={selected}
                        onMouseEnter={() => setActive(globalIdx)}
                        onClick={() => navigateTo(opt.href)}
                        className={cn(
                          "group grid min-h-12 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100",
                          selected ? "bg-surface-2" : "hover:bg-surface-1",
                        )}
                      >
                        <AssetMonogram symbol={opt.asset.symbol} />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium text-fg">{opt.asset.name}</span>
                          </span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <span className="num shrink-0 text-xs tracking-[0.02em] text-fg-muted">
                              {opt.asset.symbol}
                            </span>
                            <span aria-hidden className="text-xs text-fg-muted">
                              ·
                            </span>
                            <span className="truncate text-xs text-fg-muted">{opt.asset.originLabel}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          {opt.price !== null ? (
                            <span className="num text-[13px] leading-5 text-fg tabular-nums">
                              {formatSearchPrice(opt.price, shown)}
                            </span>
                          ) : (
                            <span className="text-xs text-fg-muted">
                              {cryptoGroupLabel(opt.asset.group, language)}
                            </span>
                          )}
                          {opt.change === null ? null : <ChangeBadge value={opt.change} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {earnOptions.length > 0 ? (
                <div role="group" aria-labelledby={groupEarnId} className="flex flex-col gap-0.5">
                  <div
                    id={groupEarnId}
                    role="presentation"
                    className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted"
                  >
                    {earnHeading}
                  </div>
                  {earnOptions.map((opt, idx) => {
                    const globalIdx = earnOffset + idx;
                    const selected = globalIdx === activeIndex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        id={`${listId}-opt-${globalIdx}`}
                        aria-selected={selected}
                        onMouseEnter={() => setActive(globalIdx)}
                        onClick={() => navigateTo(opt.href)}
                        className={cn(
                          "group grid min-h-12 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100",
                          selected ? "bg-surface-2" : "hover:bg-surface-1",
                        )}
                      >
                        <AssetMonogram symbol={opt.asset.symbol} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-fg">{opt.asset.name}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <span className="num shrink-0 text-xs tracking-[0.02em] text-fg-muted">
                              {opt.asset.symbol}
                            </span>
                            <span aria-hidden className="text-xs text-fg-muted">
                              ·
                            </span>
                            <span className="truncate text-xs text-fg-muted">{opt.asset.issuerName}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {opt.price !== null ? (
                            <span className="num text-[13px] leading-5 text-fg tabular-nums">
                              {formatSearchPrice(opt.price, shown)}
                            </span>
                          ) : (
                            <Badge tone="neutral">{earnHeading}</Badge>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {commandOptions.length > 0 ? (
                <div role="group" aria-labelledby={groupCommandsId} className="flex flex-col gap-0.5">
                  <div
                    id={groupCommandsId}
                    role="presentation"
                    className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted"
                  >
                    {commandsHeading}
                  </div>
                  {commandOptions.map((opt, idx) => {
                    const globalIdx = commandOffset + idx;
                    const selected = globalIdx === activeIndex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        id={`${listId}-opt-${globalIdx}`}
                        aria-selected={selected}
                        onMouseEnter={() => setActive(globalIdx)}
                        onClick={() => navigateTo(opt.href)}
                        className={cn(
                          "group grid min-h-11 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100",
                          selected ? "bg-surface-2" : "hover:bg-surface-1",
                        )}
                      >
                        <span
                          aria-hidden
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-1 text-fg-muted"
                        >
                          <CommandIcon id={opt.command.id} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-fg">{opt.command.label}</span>
                          <span className="block truncate text-xs text-fg-muted">{opt.command.hint}</span>
                        </span>
                        <ChevronRight selected={selected} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {stockSearchWaiting && hasOptions ? (
            <span className="sr-only" role="status" aria-live="polite">
              {t.states.loading}
            </span>
          ) : null}

          {stockSearchFailed && hasOptions ? (
            <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-3 py-2">
              <p className="text-xs text-fg-muted">{t.market.searchError}</p>
              <Button variant="secondary" size="sm" onClick={() => void search.refetch()}>
                {t.states.retry}
              </Button>
            </div>
          ) : null}

          {search.data?.hasMore && stockOptions.length > 0 ? (
            <p className="px-4 py-2 text-center text-xs text-fg-muted">{t.market.searchMore}</p>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="hidden shrink-0 items-center gap-4 border-t border-border bg-surface-1/60 px-4 py-2 text-[11px] text-fg-muted sm:flex"
        >
          <span className="flex items-center gap-1.5">
            <kbd className={KBD_CLASS}>↑</kbd>
            <kbd className={KBD_CLASS}>↓</kbd>
            {language === "en" ? "navigate" : "navegar"}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className={KBD_CLASS}>↵</kbd>
            {language === "en" ? "open" : "abrir"}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className={KBD_CLASS}>esc</kbd>
            {language === "en" ? "close" : "cerrar"}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
