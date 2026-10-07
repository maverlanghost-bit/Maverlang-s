"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TradeSheet } from "@/components/domain/trade-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { IconBack, IconShare } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { detailReturnPath, ingresarPath, aceptarPath, registroPath } from "@/lib/auth/paths";
import { cn } from "@/lib/cn";
import { formatMoney, formatMultiplier, formatReopenWhen, formatShares } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { SPOT_MS, useAssetStatus, useFx, useHistory, useMarketStatus, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { chipKeyForStatus, tradeBlockForStatus } from "@/lib/market/asset-status.shared";
import { rangeBounds, rangeMove, seriesForQuote } from "@/lib/market/series";
import type { Currency, Position, PricePoint, Quote, Range, Ticker } from "@/lib/types";

import { PricePanel } from "./price-panel";

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

function parseOperar(value: string): "comprar" | "vender" | null {
  return value === "comprar" || value === "vender" ? value : null;
}

function solscanMintUrl(mint: string) {
  return `https://solscan.io/token/${encodeURIComponent(mint)}`;
}

/** Reserva el alto real de la barra. En ≥lg queda en 0. Al salir de la página se limpia. */
function useDetailCtaOffset(active: boolean, ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (query.matches) {
        root.style.setProperty("--app-detail-cta", "0px");
        return;
      }
      const bar = ref.current;
      if (!bar) return;
      const height = bar.getBoundingClientRect().height;
      if (height <= 0) return;
      root.style.setProperty("--app-detail-cta", `${height}px`);
    };
    apply();
    const bar = ref.current;
    const observer = new ResizeObserver(apply);
    if (bar) observer.observe(bar);
    query.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", apply);
      root.style.removeProperty("--app-detail-cta");
    };
  }, [active, ref]);
}

function ShareButton({ name }: { name: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const { toast } = useToast();

  async function onShare() {
    const url = `${window.location.origin}${pathname}`;
    const payload = { title: name, text: fill(t.detail.shareText, { name, brand: site.name }), url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t.detail.shareCopied });
    } catch {
      toast({ title: t.detail.shareFailed, tone: "down" });
    }
  }

  return (
    <IconButton label={t.detail.share} onClick={() => void onShare()}>
      <IconShare />
    </IconButton>
  );
}

function shownMoney(usd: number, currency: Currency, rate: number | undefined) {
  const value = displayPrice(usd, currency, rate);
  if (value === null) return formatMoney(usd, "USD");
  return formatMoney(value, currency);
}

function PositionBlock({
  position,
  pending,
  failed,
  onRetry,
  currency,
  rate,
}: {
  position: Position | null;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  currency: Currency;
  rate: number | undefined;
}) {
  const { t } = useT();
  if (pending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
    );
  }
  if (failed) {
    return (
      <ErrorState title={t.detail.positionError} label={t.states.error} retryLabel={t.states.retry} onRetry={onRetry} />
    );
  }
  if (!position || position.shares <= 0) return null;

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-lg">{t.detail.position}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="label">{t.detail.shares}</dt>
          <dd className="num mt-1 text-sm text-fg">{formatShares(position.shares)}</dd>
        </div>
        <div>
          <dt className="label">{t.detail.value}</dt>
          <dd className="num mt-1 text-sm text-fg">{shownMoney(position.valueUsd, currency, rate)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="label">{t.detail.pnl}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            {position.pnlUsd === null ? (
              <span className="text-sm text-fg-muted">{t.detail.pnlUnknown}</span>
            ) : (
              <span
                className={
                  position.pnlUsd > 0 ? "num text-sm text-up" : position.pnlUsd < 0 ? "num text-sm text-down" : "num text-sm text-fg"
                }
              >
                {shownMoney(position.pnlUsd, currency, rate)}
              </span>
            )}
            {position.pnlPct === null ? null : <ChangeBadge value={position.pnlPct} />}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-fg-muted">{t.detail.positionNote}</p>
    </Card>
  );
}

export type DetailAccess = "guest" | "pending" | "member";

/** M38: `disabled` (no habilitada) o `halted` (negociación suspendida): CTA deshabilitado con motivo. */
export type TradeBlock = "disabled" | "halted" | null;

function AccountActions({
  variant,
  aboveTabs,
  primary,
  secondary,
}: {
  variant: "bar" | "card";
  aboveTabs: boolean;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  const wide = variant === "card";
  const barRef = useRef<HTMLDivElement>(null);
  useDetailCtaOffset(variant === "bar", barRef);

  const buttons = (
    <div className={wide ? "flex flex-col gap-3" : "flex flex-col gap-2"}>
      <Button
        asChild
        size="lg"
        className="h-auto min-h-11 w-full px-3 text-sm whitespace-nowrap sm:px-4 sm:text-base"
      >
        <Link href={primary.href}>{primary.label}</Link>
      </Button>
      {secondary ? (
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="h-auto min-h-11 w-full px-3 text-sm whitespace-nowrap sm:px-4 sm:text-base"
        >
          <Link href={secondary.href}>{secondary.label}</Link>
        </Button>
      ) : null}
    </div>
  );

  if (variant === "bar") {
    return (
      <div
        ref={barRef}
        className="fixed inset-x-0 z-20 border-t border-border bg-bg px-4 pt-3 min-[400px]:px-5 lg:hidden"
        style={
          aboveTabs
            ? { bottom: "var(--app-tabs-height)" }
            : { bottom: 0, paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }
        }
      >
        <div className="mx-auto max-w-6xl">{buttons}</div>
      </div>
    );
  }

  return <Card className="p-5 md:p-6">{buttons}</Card>;
}

function TradeActions({
  variant,
  canSell,
  blocked,
  onBuy,
  onSell,
}: {
  variant: "bar" | "card";
  canSell: boolean;
  /** M38: acción deshabilitada o suspendida en el catálogo. */
  blocked: TradeBlock;
  onBuy: () => void;
  onSell: () => void;
}) {
  const { t } = useT();
  const hintId = variant === "bar" ? "sell-hint-bar" : "sell-hint-card";
  const blockedId = variant === "bar" ? "trade-blocked-bar" : "trade-blocked-card";
  const wide = variant === "card";
  const barRef = useRef<HTMLDivElement>(null);
  useDetailCtaOffset(variant === "bar", barRef);
  const blockedReason = blocked === "halted" ? t.detail.tradeHaltedNote : blocked === "disabled" ? t.detail.tradeDisabledNote : null;
  const buyDisabled = blocked !== null;
  const sellDisabled = blocked !== null || !canSell;

  const buttons = (
    <div className={wide ? "flex flex-col gap-3" : "flex gap-3"}>
      <Button size="lg" className={wide ? "w-full" : "h-auto min-h-11 flex-1 whitespace-nowrap px-4 text-base md:h-auto md:px-5"} disabled={buyDisabled} aria-describedby={blockedReason ? blockedId : undefined} onClick={() => {
          if (!buyDisabled) onBuy();
        }}>
        {t.detail.buy}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        className={wide ? "w-full" : "h-auto min-h-11 flex-1 whitespace-nowrap px-4 text-base md:h-auto md:px-5"}
        disabled={sellDisabled}
        aria-describedby={blockedReason ? blockedId : sellDisabled ? hintId : undefined}
        onClick={() => {
          if (!sellDisabled) onSell();
        }}
      >
        {t.detail.sell}
      </Button>
    </div>
  );

  if (variant === "bar") {
    return (
      <div
        ref={barRef}
        className="fixed inset-x-0 z-20 border-t border-border bg-bg px-4 py-3 min-[400px]:px-5 lg:hidden"
        style={{ bottom: "var(--app-tabs-height)" }}
      >
        <div className="mx-auto max-w-6xl">
          {buttons}
          {blockedReason ? (
            <p id={blockedId} className="mt-2 text-center text-xs leading-relaxed text-fg-muted">
              {blockedReason}
            </p>
          ) : canSell ? null : (
            <p id={hintId} className="sr-only">
              {t.detail.sellDisabled}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-lg">{t.detail.actions}</h2>
      <div className="mt-4">{buttons}</div>
      {blockedReason ? (
        <p id={blockedId} className="mt-3 text-sm leading-relaxed text-fg-muted">
          {blockedReason}
        </p>
      ) : canSell ? null : (
        <p id={hintId} className="mt-3 text-sm leading-relaxed text-fg-muted">
          {t.detail.sellDisabled}
        </p>
      )}
    </Card>
  );
}

function categoryName(
  category: Ticker["category"],
  labels: Record<Ticker["category"], string>,
) {
  return labels[category] ?? category;
}

function FactChip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2 py-0.5 text-xs leading-4 font-medium text-fg-body">
      {children}
    </li>
  );
}

function MissingFigure({ label }: { label: string }) {
  return (
    <span className="num text-sm text-fg-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function StatCell({ label, pending, children }: { label: string; pending: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface-1 px-3 py-3" aria-busy={pending || undefined}>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1">{pending ? <Skeleton className="h-5 w-20" /> : children}</dd>
    </div>
  );
}

function moneyText(usd: number, currency: Currency, rate: number | undefined) {
  const value = displayPrice(usd, currency, rate);
  if (value === null) return null;
  return formatMoney(value, currency);
}

function KeyStats({
  quote,
  quotePending,
  points,
  historyPending,
  historyError,
  range,
  currency,
  rate,
}: {
  quote: Quote | null;
  quotePending: boolean;
  points: readonly PricePoint[];
  historyPending: boolean;
  historyError: boolean;
  range: Range;
  currency: Currency;
  rate: number | undefined;
}) {
  const { t } = useT();
  const caption = t.detail.rangeCaption[range];
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const move = historyPending || historyError ? null : rangeMove(points);
  const bounds = historyPending || historyError ? null : rangeBounds(points);
  const rangeMissing = historyError ? t.detail.chartError : t.detail.chartEmpty;
  const quoteCellPending = quotePending && quote === null;
  const high = bounds ? moneyText(bounds.high, shownCurrency, rate) : null;
  const low = bounds ? moneyText(bounds.low, shownCurrency, rate) : null;

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-lg">{t.detail.stats}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border">
        {/* 24 h: quote.change24hPct. En vivo es Jupiter priceChange24h, igual que el mercado. */}
        <StatCell label={t.detail.change24h} pending={quoteCellPending}>
          {quote && Number.isFinite(quote.change24hPct) ? (
            <ChangeBadge value={quote.change24hPct} />
          ) : (
            <MissingFigure label={t.detail.unavailable} />
          )}
        </StatCell>
        <StatCell label={fill(t.detail.rangeChange, { range: caption })} pending={historyPending}>
          {move === null ? <MissingFigure label={rangeMissing} /> : <ChangeBadge value={move} />}
        </StatCell>
        <StatCell label={fill(t.detail.rangeHigh, { range: caption })} pending={historyPending}>
          {high === null ? <MissingFigure label={rangeMissing} /> : <span className="num text-sm text-fg">{high}</span>}
        </StatCell>
        <StatCell label={fill(t.detail.rangeLow, { range: caption })} pending={historyPending}>
          {low === null ? <MissingFigure label={rangeMissing} /> : <span className="num text-sm text-fg">{low}</span>}
        </StatCell>
        <StatCell label={t.detail.marketPrice} pending={quoteCellPending}>
          {quote?.marketPriceUsd !== undefined && Number.isFinite(quote.marketPriceUsd) ? (
            <span className="num text-sm text-fg">{moneyText(quote.marketPriceUsd, shownCurrency, rate)}</span>
          ) : (
            <MissingFigure label={t.detail.unavailable} />
          )}
        </StatCell>
        <StatCell label={t.detail.poolLiquidity} pending={quoteCellPending}>
          {quote?.liquidityUsd !== undefined && Number.isFinite(quote.liquidityUsd) ? (
            <span className="num text-sm text-fg">{formatMoney(quote.liquidityUsd, "USD")}</span>
          ) : (
            <MissingFigure label={t.detail.unavailable} />
          )}
        </StatCell>
      </dl>
    </Card>
  );
}

export function DetailScreen({
  ticker,
  about,
  initialOperar,
  access,
  tradeBlock = null,
}: {
  ticker: Ticker;
  about: { es: string; en: string } | null;
  initialOperar: string;
  access: DetailAccess;
  tradeBlock?: TradeBlock;
}) {
  const { t, language, currency } = useT();
  const pathname = usePathname();
  const { mode } = useAccountMode();
  const prices = usePrices([ticker.symbol], true, SPOT_MS);
  const fx = useFx();
  const canTrade = access === "member";
  const portfolio = usePortfolio(access !== "guest");
  const status = useMarketStatus();
  const asset = useAssetStatus(ticker.symbol);
  const { symbols, toggle } = useFavorites();
  const [range, setRange] = useState<Range>("1M");
  const history = useHistory(ticker.symbol, range);
  const [requested, setRequested] = useState(() => parseOperar(initialOperar));
  const [operar, setOperar] = useState(() => (canTrade ? parseOperar(initialOperar) : null));
  const pushed = useRef(false);

  useEffect(() => {
    const onPop = () => {
      const next = parseOperar(new URLSearchParams(window.location.search).get("operar") ?? "");
      setRequested(next);
      if (!canTrade) {
        setOperar(null);
        return;
      }
      pushed.current = false;
      setOperar(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [canTrade]);

  const quote = prices.data?.find((item) => item.symbol === ticker.symbol) ?? null;
  const points = seriesForQuote(history.data ?? [], quote?.priceUsd);
  const position = portfolio.data?.positions.find((item) => item.symbol === ticker.symbol) ?? null;
  const canSell = (position?.shares ?? 0) > 0;
  const saved = symbols?.includes(ticker.symbol) ?? false;
  const favoriteLabel = fill(saved ? t.market.favoriteOn : t.market.favoriteOff, { name: ticker.name });
  const aboutText = about ? (language === "en" ? about.en : about.es) : null;
  const rate = fx.data?.rate;
  const category = categoryName(ticker.category, t.market);
  // Horario real por acción (M39): live → catálogo → mock. El estado general queda de respaldo.
  const live = asset.data ?? null;
  const chipKey = live ? chipKeyForStatus(live) : null;
  const liveHalted = live?.halted === true;
  const effectiveBlock: TradeBlock = tradeBlock ?? tradeBlockForStatus({ halted: liveHalted });
  const phase = status.data?.session;
  const fallbackChip =
    phase === "closed" ? t.detail.marketClosed : phase === "offHours" ? t.detail.marketOffHours : t.detail.marketOpen;
  const fallbackNote =
    phase === "closed"
      ? t.detail.marketClosedNote
      : phase === "offHours"
        ? t.detail.marketOffHoursNote
        : t.detail.marketOpenNote;
  const assetChip =
    chipKey === "halted"
      ? t.detail.assetHalted
      : chipKey === "market"
        ? t.detail.assetOpen
        : chipKey === "extended"
          ? t.detail.assetExtended
          : chipKey === "overnight"
            ? t.detail.assetOvernight
            : chipKey === "closed"
              ? t.detail.assetClosed
              : null;
  const reopenWhen = live?.nextChangeAt ? formatReopenWhen(live.nextChangeAt, language) : null;
  const reopenText =
    chipKey === "closed" && reopenWhen ? fill(t.detail.assetReopen, { when: reopenWhen }) : null;
  const chipText = assetChip ?? fallbackChip;
  const chipNote =
    chipKey === "halted"
      ? t.detail.tradeHaltedNote
      : chipKey === "closed"
        ? reopenText ?? fallbackNote
        : chipKey === "market" || chipKey === null
          ? phase === "regular"
            ? null
            : fallbackNote
          : null;
  const chipDot = chipKey === "halted" ? "bg-down" : chipKey === "market" ? "bg-up" : "bg-warn";
  const scheduleText =
    live?.mode === "TwentyFourFive"
      ? t.detail.scheduleAlways
      : live?.mode === "MarketHours" || live?.mode === "Regular"
        ? t.detail.scheduleExchange
        : null;
  const statusPending = asset.isPending && status.isPending;
  const statusReady = asset.isSuccess || status.isSuccess;

  const back = detailReturnPath(ticker.symbol, requested);
  const enter = ingresarPath(back);
  const create = registroPath(back);
  const resume = aceptarPath(back);

  function openOperar(next: "comprar" | "vender" | null) {
    const params = new URLSearchParams(window.location.search);
    const current = parseOperar(params.get("operar") ?? "");
    if (next === current) {
      setOperar(next);
      return;
    }
    if (!next && pushed.current) {
      pushed.current = false;
      setOperar(null);
      window.history.back();
      return;
    }
    if (next) params.set("operar", next);
    else params.delete("operar");
    const search = params.toString();
    const href = search ? `${pathname}?${search}` : pathname;
    setOperar(next);
    if (next && !current) {
      pushed.current = true;
      window.history.pushState(null, "", href);
      return;
    }
    pushed.current = false;
    window.history.replaceState(null, "", href);
  }

  function tradeSlot(variant: "bar" | "card") {
    if (mode === "real") {
      if (variant === "bar") {
        return (
          <div className="fixed inset-x-0 z-20 border-t border-border bg-bg px-4 py-3 min-[400px]:px-5 lg:hidden" style={{ bottom: "var(--app-tabs-height)" }}>
            <p className="mx-auto max-w-6xl text-center text-sm text-fg-muted">{t.account.comingTitle}</p>
          </div>
        );
      }
      return (
        <Card className="p-5 md:p-6">
          <RealAccountEmpty />
        </Card>
      );
    }
    if (access === "member") {
      return (
        <TradeActions
          variant={variant}
          canSell={canSell}
          blocked={effectiveBlock}
          onBuy={() => openOperar("comprar")}
          onSell={() => openOperar("vender")}
        />
      );
    }
    if (access === "pending") {
      return (
        <AccountActions
          variant={variant}
          aboveTabs
          primary={{ href: resume, label: t.detail.finishSignup }}
        />
      );
    }
    return (
      <AccountActions
        variant={variant}
        aboveTabs={false}
        primary={{ href: create, label: t.detail.signupToInvest }}
        secondary={{ href: enter, label: t.detail.loginToInvest }}
      />
    );
  }

  return (
    <>
    <div data-ticker={ticker.symbol} className="lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-8">
        <Link
          href="/app"
          className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-sm text-fg-muted transition hover:text-fg"
        >
          <IconBack className="size-4" />
          {t.detail.backToMarket}
        </Link>
        <header className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <TickerLogo symbol={ticker.symbol} name={ticker.name} logoUrl={ticker.logo} size={56} decorative />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl text-balance">{ticker.name}</h1>
              <p className="mt-1 text-sm text-fg-muted">
                <span className="num text-fg">{ticker.symbol}</span>
                <span aria-hidden> · </span>
                <span>
                  <span className="sr-only">{t.detail.underlying} </span>
                  {ticker.underlying}
                </span>
              </p>
            </div>
            <div className="flex shrink-0">
              <FavoriteButton pressed={saved} label={favoriteLabel} onToggle={() => toggle(ticker.symbol)} />
              <ShareButton name={ticker.name} />
            </div>
          </div>
          <ul className="flex list-none flex-wrap gap-1.5 p-0" aria-label={t.detail.chips}>
            {category ? <FactChip>{category}</FactChip> : null}
            <FactChip>{t.detail.tokenOnSolana}</FactChip>
            {effectiveBlock !== null ? <FactChip>{t.detail.tradeUnavailable}</FactChip> : null}
            {/* Horario real por acción (M39): suspendida, abierto, extendido, nocturno o cerrado. */}
            {statusPending ? (
              <li>
                <Skeleton className="h-5 w-28 rounded-full" />
              </li>
            ) : statusReady ? (
              <FactChip>
                <span className={cn("size-1.5 shrink-0 rounded-full", chipDot)} aria-hidden />
                {chipText}
              </FactChip>
            ) : null}
          </ul>
          {scheduleText ? <p className="text-xs leading-relaxed text-fg-muted">{scheduleText}</p> : null}
          {statusReady && chipNote ? (
            <p className="text-xs leading-relaxed text-fg-muted">{chipNote}</p>
          ) : null}
        </header>

        <PricePanel
          symbol={ticker.symbol}
          name={ticker.name}
          quote={quote}
          pending={prices.isPending}
          onRetry={() => {
            void prices.refetch();
          }}
          currency={currency}
          rate={rate}
          fxPending={fx.isPending}
          range={range}
          onRangeChange={setRange}
          priceUpdatedAt={prices.dataUpdatedAt || quote?.updatedAt || null}
          priceStale={quote?.stale === true}
        />

        <KeyStats
          quote={quote}
          quotePending={prices.isPending}
          points={points}
          historyPending={history.isPending}
          historyError={history.isError}
          range={range}
          currency={currency}
          rate={rate}
        />

        {access === "guest" ? null : (
          <PositionBlock
            position={position}
            pending={portfolio.isPending}
            failed={portfolio.isError}
            onRetry={() => {
              void portfolio.refetch();
            }}
            currency={currency}
            rate={rate}
          />
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg">{t.detail.aboutTitle}</h2>
          <p className="text-sm leading-relaxed text-fg-muted">{t.detail.aboutNote}</p>
          <p className="text-sm leading-relaxed text-fg-body">{aboutText ?? t.detail.aboutMissing}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg">{t.detail.tokenTitle}</h2>
          <p className="text-sm leading-relaxed text-fg-body">
            {fill(t.detail.tokenLead, { issuer: ticker.issuer, brand: site.name, name: ticker.name })}
          </p>
          <dl className="grid gap-4 border-t border-border pt-4">
            <div>
              <dt className="label">{t.detail.issuer}</dt>
              <dd className="mt-1 text-sm text-fg">{ticker.issuer}</dd>
            </div>
            <div>
              <dt className="label">{t.detail.mint}</dt>
              <dd className="mt-1">
                <p className="text-sm text-fg-muted">{t.detail.mintHint}</p>
                <p className="num mt-2 break-all text-sm text-fg">{ticker.mint}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <CopyButton value={ticker.mint} label={t.detail.copy} copiedLabel={t.detail.copied} />
                  <a
                    href={solscanMintUrl(ticker.mint)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-fg underline underline-offset-4"
                  >
                    {t.detail.explorer}
                    <span className="sr-only">. {t.detail.explorerNew}</span>
                  </a>
                </div>
              </dd>
            </div>
            <div>
              <dt className="label">{t.detail.multiplier}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-fg-body">
                {quote && Number.isFinite(quote.multiplier) ? (
                  <span className="num text-fg">{formatMultiplier(quote.multiplier)}</span>
                ) : (
                  <MissingFigure label={t.detail.unavailable} />
                )}
                {". "}
                {t.detail.multiplierHint}
              </dd>
            </div>
          </dl>
          <p className="text-sm leading-relaxed text-fg-body">{t.detail.risks}</p>
          <Link href="/legal/riesgos" className="text-sm font-medium text-fg underline underline-offset-4">
            {t.detail.risksLink}
          </Link>
        </section>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-8">{tradeSlot("card")}</div>
      </aside>

    </div>

      {tradeSlot("bar")}

      {access === "member" && effectiveBlock === null ? (
        <TradeSheet
          ticker={ticker}
          side={operar === "vender" ? "sell" : "buy"}
          open={operar !== null}
          onOpenChange={(open) => {
            if (!open) openOperar(null);
          }}
        />
      ) : null}
    </>
  );
}
