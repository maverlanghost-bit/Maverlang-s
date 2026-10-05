"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TradeSheet } from "@/components/domain/trade-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { IconShare } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { formatClp, formatMoney, formatMultiplier, formatShares, formatUsd } from "@/lib/format";
import { useFx, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import type { Currency, Position, Ticker } from "@/lib/types";

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

function TradeActions({
  variant,
  canSell,
  onBuy,
  onSell,
}: {
  variant: "bar" | "card";
  canSell: boolean;
  onBuy: () => void;
  onSell: () => void;
}) {
  const { t } = useT();
  const hintId = variant === "bar" ? "sell-hint-bar" : "sell-hint-card";
  const wide = variant === "card";
  const barRef = useRef<HTMLDivElement>(null);
  useDetailCtaOffset(variant === "bar", barRef);

  const buttons = (
    <div className={wide ? "flex flex-col gap-3" : "flex gap-3"}>
      <Button size="lg" className={wide ? "w-full" : "h-auto min-h-11 flex-1 whitespace-nowrap px-4 text-base md:h-auto md:px-5"} onClick={onBuy}>
        {t.detail.buy}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        className={wide ? "w-full" : "h-auto min-h-11 flex-1 whitespace-nowrap px-4 text-base md:h-auto md:px-5"}
        disabled={!canSell}
        aria-describedby={canSell ? undefined : hintId}
        onClick={() => {
          if (canSell) onSell();
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
          {canSell ? null : (
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
      {canSell ? null : (
        <p id={hintId} className="mt-3 text-sm leading-relaxed text-fg-muted">
          {t.detail.sellDisabled}
        </p>
      )}
    </Card>
  );
}

export function DetailScreen({
  ticker,
  about,
  initialOperar,
}: {
  ticker: Ticker;
  about: { es: string; en: string } | null;
  initialOperar: string;
}) {
  const { t, language, currency } = useT();
  const pathname = usePathname();
  const prices = usePrices([ticker.symbol]);
  const fx = useFx();
  const portfolio = usePortfolio();
  const { symbols, toggle } = useFavorites();
  const [operar, setOperar] = useState(() => parseOperar(initialOperar));
  const pushed = useRef(false);

  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
      setOperar(parseOperar(new URLSearchParams(window.location.search).get("operar") ?? ""));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const quote = prices.data?.find((item) => item.symbol === ticker.symbol) ?? null;
  const position = portfolio.data?.positions.find((item) => item.symbol === ticker.symbol) ?? null;
  const canSell = (position?.shares ?? 0) > 0;
  const saved = symbols?.includes(ticker.symbol) ?? false;
  const favoriteLabel = fill(saved ? t.market.favoriteOn : t.market.favoriteOff, { name: ticker.name });
  const aboutText = about ? (language === "en" ? about.en : about.es) : null;
  const rate = fx.data?.rate;
  const clp = quote ? displayPrice(quote.priceUsd, "CLP", rate) : null;

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

  return (
    <>
    <div data-ticker={ticker.symbol} className="lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex items-start gap-3">
          <TickerLogo symbol={ticker.symbol} name={ticker.name} logoUrl={ticker.logo} size={48} decorative />
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
        />

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

        <Card className="p-5 md:p-6">
          <h2 className="text-lg">{t.detail.stats}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            <div>
              <dt className="label">{t.detail.priceUsd}</dt>
              <dd className="num mt-1 text-sm text-fg">{quote ? formatUsd(quote.priceUsd) : "—"}</dd>
            </div>
            <div>
              <dt className="label">{t.detail.priceClp}</dt>
              <dd className="num mt-1 text-sm text-fg">{clp === null ? t.detail.fxMissing : formatClp(clp)}</dd>
            </div>
            <div>
              <dt className="label">{t.detail.change24h}</dt>
              <dd className="mt-1">{quote ? <ChangeBadge value={quote.change24hPct} /> : <span className="text-sm text-fg-muted">—</span>}</dd>
            </div>
            <div>
              <dt className="label">{t.detail.multiplier}</dt>
              <dd className="num mt-1 text-sm text-fg">{quote ? formatMultiplier(quote.multiplier) : "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="label">{t.detail.issuer}</dt>
              <dd className="mt-1 text-sm text-fg">{ticker.issuer}</dd>
            </div>
          </dl>
        </Card>

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
          <dl className="grid gap-4">
            <div>
              <dt className="label">{t.detail.mint}</dt>
              <dd className="mt-1">
                <p className="text-sm text-fg-muted">{t.detail.mintHint}</p>
                <a
                  href={solscanMintUrl(ticker.mint)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex max-w-full flex-col items-start gap-1 text-sm text-fg"
                >
                  <span className="num break-all underline underline-offset-4">{ticker.mint}</span>
                  <span className="underline underline-offset-4">{t.detail.explorer}</span>
                  <span className="sr-only">{t.detail.explorerNew}</span>
                </a>
              </dd>
            </div>
            <div>
              <dt className="label">{t.detail.multiplier}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-fg-body">
                <span className="num text-fg">{quote ? formatMultiplier(quote.multiplier) : "—"}</span>
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
        <div className="sticky top-8">
          <TradeActions variant="card" canSell={canSell} onBuy={() => openOperar("comprar")} onSell={() => openOperar("vender")} />
        </div>
      </aside>

    </div>

      <TradeActions
        variant="bar"
        canSell={canSell}
        onBuy={() => openOperar("comprar")}
        onSell={() => openOperar("vender")}
      />

      <TradeSheet
        ticker={ticker}
        side={operar === "vender" ? "sell" : "buy"}
        open={operar !== null}
        onOpenChange={(open) => {
          if (!open) openOperar(null);
        }}
      />
    </>
  );
}
