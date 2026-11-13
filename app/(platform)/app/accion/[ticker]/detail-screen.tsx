"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { motion, useReducedMotion } from "framer-motion";
import { AskAiButton } from "@/components/ai/ask-ai-button";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { ShareCardButton } from "@/components/domain/share-card-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TokenGapCard } from "@/components/domain/token-gap-card";
import { OnchainVerificationCard } from "@/components/domain/onchain-verification-card";
import { AlertButton } from "@/components/domain/alert-button";
import { CompanyCard } from "@/components/domain/company-card";
import { ExplainChartButton } from "@/components/domain/explain-chart-button";
import { WhatIfCalculator } from "@/components/domain/what-if-calculator";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { carteraCopy } from "@/content/i18n/extra-cartera";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { IconBack, IconShare } from "@/components/ui/icons";
import { NotFoundView } from "@/components/ui/not-found-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { isRealAccountUiBlocked } from "@/lib/account/real-ui-gate";
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

const TradeSheet = dynamic(() => import("@/components/domain/trade-sheet").then((mod) => mod.TradeSheet), {
  ssr: false,
});

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

/** Rango del gráfico en palabras, para la pregunta precargada del asistente. */
const RANGE_QUESTION_LABEL: Record<Range, string> = {
  "1D": "1 día",
  "1W": "1 semana",
  "1M": "1 mes",
  "3M": "3 meses",
  "1Y": "1 año",
  ALL: "todo el historial",
};

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

/**
 * Rótulos y cifras de una misma familia en toda la ficha: 13px mono
 * mayúsculas para el rótulo, 15px tabular para el dato. Nada informativo
 * baja de 13px.
 */
const METRIC_LABEL = "font-mono text-[13px] leading-4 font-medium tracking-[0.06em] text-fg-muted uppercase";
const NOTE = "text-[13px] leading-5 text-fg-muted";

/**
 * Fila de especificación: rótulo a la izquierda y valor a la derecha,
 * separados por una hairline. En 360 px el valor puede bajar de línea sin
 * empujar la página ni desbordar.
 */
function DataRow({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className={cn(METRIC_LABEL, "min-w-0 flex-1")}>{label}</dt>
      <dd
        className={cn(
          "min-w-0 max-w-[62%] text-right text-[15px] leading-5 font-medium text-fg tabular-nums [overflow-wrap:anywhere]",
          mono ? "num" : "font-sans",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function PositionRows({
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
      <div className="mt-5 border-t border-border pt-5" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-full" />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="mt-5 border-t border-border pt-5">
        <ErrorState title={t.detail.positionError} label={t.states.error} retryLabel={t.states.retry} onRetry={onRetry} />
      </div>
    );
  }
  if (!position || position.shares <= 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-5">
      <h3 className="label">{t.detail.position}</h3>
      <dl className="mt-1">
        <DataRow label={t.detail.shares}>{formatShares(position.shares)}</DataRow>
        <DataRow label={t.detail.value}>{shownMoney(position.valueUsd, currency, rate)}</DataRow>
        <DataRow label={t.detail.pnl}>
          {position.pnlUsd === null ? (
            <span className="text-fg-muted">{t.detail.pnlUnknown}</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span
                className={cn(
                  "num tabular-nums",
                  position.pnlUsd > 0 ? "text-up" : position.pnlUsd < 0 ? "text-down" : "text-fg",
                )}
              >
                {shownMoney(position.pnlUsd, currency, rate)}
              </span>
              {position.pnlPct === null ? null : <ChangeBadge value={position.pnlPct} size="sm" />}
            </span>
          )}
        </DataRow>
      </dl>
      <p className={cn("mt-2", NOTE)}>{t.detail.positionNote}</p>
    </div>
  );
}

function StockTokenGuide() {
  const { language } = useT();
  const copy = carteraCopy(language);
  return (
    <section aria-label={copy.tokenGuideTitle}>
      <Accordion items={[{ id: "stock-token", title: copy.tokenGuideTitle, content: copy.tokenGuideBody }]} />
    </section>
  );
}

export type DetailAccess = "guest" | "pending" | "member";

/** M38/M54: `disabled` (no habilitada), `halted` (suspendida) o `review` (en revisión): CTA deshabilitado con motivo. */
export type TradeBlock = "disabled" | "halted" | "review" | null;

/** Estado de seguridad del servidor para esta ficha (unión local: sin importar servidor). */
export type DetailSafetyStatus = "listed" | "watch" | "hidden" | "unknown";

function AccountActions({
  variant,
  aboveTabs,
  primary,
  secondary,
  symbol,
  underlying,
  issuer,
  quote,
  currency,
  rate,
}: {
  variant: "bar" | "card";
  aboveTabs: boolean;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  symbol: string;
  underlying: string;
  issuer: Ticker["issuer"];
  quote: Quote | null;
  currency: Currency;
  rate: number | undefined;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  useDetailCtaOffset(variant === "bar", barRef);

  const buttons = (
    <div className="flex flex-col gap-1.5">
      <Button
        asChild
        size="lg"
        className="h-auto min-h-12 w-full px-3 text-[15px] font-semibold whitespace-nowrap sm:px-4"
      >
        <Link href={primary.href}>{primary.label}</Link>
      </Button>
      {secondary ? (
        <Button
          asChild
          variant="ghost"
          size="lg"
          className="h-auto min-h-11 w-full px-3 text-[13px] font-medium whitespace-nowrap text-fg-muted hover:text-fg sm:px-4"
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
        className="fixed inset-x-0 z-20 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur-xl lg:hidden"
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

  return (
    <Card className="border-border bg-bg p-5 lg:p-6">
      <BuyPriceBox
        divided={false}
        symbol={symbol}
        underlying={underlying}
        issuer={issuer}
        quote={quote}
        currency={currency}
        rate={rate}
      />
      <div className="mt-5 border-t border-border pt-5">{buttons}</div>
    </Card>
  );
}

function BuyPriceBox({
  divided = true,
  symbol,
  underlying,
  issuer,
  quote,
  currency,
  rate,
}: {
  /** Hairline superior cuando la caja sigue a un encabezado dentro de la ficha. */
  divided?: boolean;
  symbol: string;
  underlying: string;
  issuer: Ticker["issuer"];
  quote: Quote | null;
  currency: Currency;
  rate: number | undefined;
}) {
  const { t, language } = useT();
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const hasPrice = quote !== null && Number.isFinite(quote.priceUsd) && quote.priceUsd > 0;
  const primaryPrice = hasPrice && quote ? shownMoney(quote.priceUsd, shownCurrency, rate) : null;
  const secondaryPrice =
    hasPrice && quote && fxKnown && typeof rate === "number"
      ? shownCurrency === "CLP"
        ? formatMoney(quote.priceUsd, "USD")
        : formatMoney(quote.priceUsd * rate, "CLP")
      : null;

  return (
    <div className={cn(divided && "mt-5 border-t border-border pt-5")}>
      <p className="label">{language === "en" ? `Buy price · 1 ${symbol}` : `Precio de compra · 1 ${symbol}`}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {primaryPrice ? (
          <p className="num text-[27px] leading-none font-medium tracking-tight text-fg">{primaryPrice}</p>
        ) : (
          <Skeleton className="h-8 w-32" />
        )}
        {quote && Number.isFinite(quote.change24hPct) ? <ChangeBadge value={quote.change24hPct} /> : null}
      </div>
      {secondaryPrice ? (
        <p className={cn("num mt-2", NOTE)}>
          {language === "en" ? `Approx. ${secondaryPrice} per share (${underlying})` : `Equivale a ${secondaryPrice} por acción (${underlying})`}
        </p>
      ) : null}
      <dl className="mt-4 border-t border-border">
        <div className="flex flex-col gap-0.5 border-b border-border py-2.5">
          <dt className={METRIC_LABEL}>{language === "en" ? "Minimum" : "Inversión mínima"}</dt>
          <dd className="text-[15px] leading-5 font-medium text-fg">
            {language === "en" ? "Fractional shares" : "Desde fracciones"}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 py-2.5">
          <dt className={METRIC_LABEL}>{t.detail.issuer}</dt>
          <dd className="text-[15px] leading-5 font-medium text-fg">{issuer}</dd>
        </div>
      </dl>
    </div>
  );
}

function SellHelp({ hintId }: { hintId: string }) {
  const { t, language } = useT();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="group/sell-help relative shrink-0" onMouseLeave={() => setHelpOpen(false)}>
      <button
        type="button"
        aria-label={language === "en" ? "Why is selling disabled?" : "¿Por qué no puedo vender?"}
        aria-expanded={helpOpen}
        aria-describedby={hintId}
        onClick={() => setHelpOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-full text-[13px] font-medium text-fg-muted outline-none transition-colors hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 sm:size-9"
      >
        ?
      </button>
      <span
        id={hintId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute right-0 bottom-full z-30 mb-2 w-56 rounded-xl border border-border bg-fg px-3 py-2 text-left text-xs leading-relaxed font-medium text-bg shadow-float transition-all duration-150",
          "translate-y-1 opacity-0 group-hover/sell-help:pointer-events-auto group-hover/sell-help:translate-y-0 group-hover/sell-help:opacity-100 group-focus-within/sell-help:pointer-events-auto group-focus-within/sell-help:translate-y-0 group-focus-within/sell-help:opacity-100",
          helpOpen && "pointer-events-auto translate-y-0 opacity-100",
        )}
      >
        {t.detail.sellDisabled}
      </span>
    </div>
  );
}

function TradeActions({
  variant,
  canSell,
  blocked,
  isHidden,
  onBuy,
  onSell,
  symbol,
  underlying,
  issuer,
  quote,
  currency,
  rate,
  position,
  positionPending,
  positionFailed,
  onRetryPosition,
  chipText,
  chipDot,
}: {
  variant: "bar" | "card";
  canSell: boolean;
  /** M38: acción deshabilitada o suspendida en el catálogo. */
  blocked: TradeBlock;
  /** M54c-fix: en `hidden` con posición se vende aunque no se pueda comprar. */
  isHidden: boolean;
  onBuy: () => void;
  onSell: () => void;
  symbol: string;
  underlying: string;
  issuer: Ticker["issuer"];
  quote: Quote | null;
  currency: Currency;
  rate: number | undefined;
  position: Position | null;
  positionPending: boolean;
  positionFailed: boolean;
  onRetryPosition: () => void;
  chipText: string;
  chipDot: string;
}) {
  const { t, language } = useT();
  const hintId = variant === "bar" ? "sell-hint-bar" : "sell-hint-card";
  const blockedId = variant === "bar" ? "trade-blocked-bar" : "trade-blocked-card";
  const wide = variant === "card";
  const barRef = useRef<HTMLDivElement>(null);
  useDetailCtaOffset(variant === "bar", barRef);
  const blockedReason =
    blocked === "halted"
      ? t.detail.tradeHaltedNote
      : blocked === "review"
        ? isHidden
          ? t.portfolio.hiddenNotice
          : t.detail.tradeReviewNote
        : blocked === "disabled"
          ? t.detail.tradeDisabledNote
          : null;
  const buyDisabled = blocked !== null;
  // M54c-fix: en revisión (`watch` o `hidden`) la venta de lo que ya se tiene
  // sigue habilitada; el resto bloquea ambos lados como siempre.
  const sellDisabled = blocked === "review" ? !canSell : blocked !== null || !canSell;

  const buyButton = (
    <Button
      size="lg"
      className={
        wide
          ? "min-h-12 w-full text-[15px] font-semibold"
          : "h-auto min-h-12 min-w-0 flex-[1.6] px-3 text-[15px] font-semibold"
      }
      disabled={buyDisabled}
      aria-describedby={blockedReason ? blockedId : undefined}
      onClick={() => {
        if (!buyDisabled) onBuy();
      }}
    >
      {t.detail.buy}
    </Button>
  );

  const sellButton = (
    <Button
      size="lg"
      variant="secondary"
      className={cn(
        "min-w-0",
        wide
          ? "min-h-11 w-full text-[13px] font-medium"
          : "h-auto min-h-12 flex-1 px-3 text-[13px] font-medium whitespace-nowrap",
      )}
      disabled={sellDisabled}
      aria-describedby={blockedReason ? blockedId : sellDisabled ? hintId : undefined}
      onClick={() => {
        if (!sellDisabled) onSell();
      }}
    >
      {t.detail.sell}
    </Button>
  );

  const buttons = (
    <div
      role="group"
      aria-label={language === "en" ? "Buy or sell" : "Comprar o vender"}
      className={wide ? "flex flex-col gap-1.5" : "flex gap-2"}
    >
      {buyButton}
      {sellDisabled && !blockedReason ? (
        <div className={cn("flex items-center gap-1", wide ? "w-full" : "min-w-0 flex-1")}>
          {sellButton}
          <SellHelp hintId={hintId} />
        </div>
      ) : (
        sellButton
      )}
    </div>
  );

  const positionLine =
    position && position.shares > 0 ? (
      <p className="num flex min-w-0 items-baseline justify-between gap-3 pb-2 text-xs leading-4 text-fg-muted">
        <span className="min-w-0 truncate">
          <span className="sr-only">{t.detail.position}: </span>
          {formatShares(position.shares)} · {shownMoney(position.valueUsd, currency, rate)}
        </span>
        {position.pnlPct === null ? null : (
          <span className="shrink-0">
            <ChangeBadge value={position.pnlPct} size="sm" />
          </span>
        )}
      </p>
    ) : null;

  if (variant === "bar") {
    return (
      <div
        ref={barRef}
        className="fixed inset-x-0 z-20 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur-xl lg:hidden"
        style={{ bottom: "var(--app-tabs-height)" }}
      >
        <div className="mx-auto max-w-6xl">
          {positionLine}
          {buttons}
          {blockedReason ? (
            <p id={blockedId} className="mt-2 text-center text-xs leading-relaxed text-fg-muted">
              {blockedReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Card className="border-border bg-bg p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium tracking-tight text-fg">{t.detail.actions}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs leading-5 text-fg-muted">
          <span className={cn("size-1.5 shrink-0 rounded-full", chipDot)} aria-hidden />
          {chipText}
        </span>
      </div>
      <BuyPriceBox symbol={symbol} underlying={underlying} issuer={issuer} quote={quote} currency={currency} rate={rate} />
      <PositionRows
        position={position}
        pending={positionPending}
        failed={positionFailed}
        onRetry={onRetryPosition}
        currency={currency}
        rate={rate}
      />
      <div className="mt-5 border-t border-border pt-5">{buttons}</div>
      {blockedReason ? (
        <p id={blockedId} className={cn("mt-3", NOTE)}>
          {blockedReason}
        </p>
      ) : null}
    </Card>
  );
}

function categoryName(
  category: Ticker["category"],
  labels: Record<Ticker["category"], string>,
) {
  return labels[category] ?? category;
}

function ContextItem({ children, separator = false }: { children: ReactNode; separator?: boolean }) {
  return (
    <li className="inline-flex shrink-0 items-center gap-2.5">
      {separator ? (
        <span aria-hidden className="shrink-0 text-fg-muted">
          ·
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{children}</span>
    </li>
  );
}

function MissingFigure({ label }: { label: string }) {
  return (
    <span className="text-fg-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
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
  issuer,
  categoryLabel,
  tradeBlock,
}: {
  quote: Quote | null;
  quotePending: boolean;
  points: readonly PricePoint[];
  historyPending: boolean;
  historyError: boolean;
  range: Range;
  currency: Currency;
  rate: number | undefined;
  /** Del objeto `ticker` (page.tsx → toTicker): "Backed (xStocks)" u "Ondo". */
  issuer: Ticker["issuer"];
  /** Etiqueta ya resuelta con `t.market` en la pantalla. */
  categoryLabel: string;
  /** Estado de operación del servidor (`page.tsx`); null = operable. */
  tradeBlock: TradeBlock;
}) {
  const { t } = useT();
  const caption = range === "ALL" ? t.detail.rangeShort.ALL : t.detail.rangeCaption[range];
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const move = historyPending || historyError ? null : rangeMove(points);
  const bounds = historyPending || historyError ? null : rangeBounds(points);
  const rangeMissing = historyError ? t.detail.chartError : t.detail.chartEmpty;
  const quoteCellPending = quotePending && quote === null;
  const high = bounds ? moneyText(bounds.high, shownCurrency, rate) : null;
  const low = bounds ? moneyText(bounds.low, shownCurrency, rate) : null;
  const priceNow =
    quote && Number.isFinite(quote.priceUsd) ? moneyText(quote.priceUsd, shownCurrency, rate) : null;
  // Estado con textos ya publicados (i18n). Sin market cap ni volumen: no
  // existen en Ticker/Quote, no se inventan.
  const estadoText =
    tradeBlock === "halted"
      ? t.detail.assetHalted
      : tradeBlock === "review"
        ? t.market.underReview
        : tradeBlock === "disabled"
          ? t.detail.tradeUnavailable
          : t.detail.operable;

  return (
    <section className="border-t border-border pt-8">
      <h2 className="text-lg font-medium tracking-tight text-fg">{t.detail.stats}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {/* Precio actual: mismo `quote.priceUsd` del titular, en tu moneda. */}
        <DataRow label={shownCurrency === "CLP" ? t.detail.priceClp : t.detail.priceUsd}>
          {quoteCellPending ? (
            <Skeleton className="ml-auto h-4 w-20" />
          ) : priceNow === null ? (
            <MissingFigure label={t.detail.unavailable} />
          ) : (
            priceNow
          )}
        </DataRow>
        {/* 24 h: quote.change24hPct. En vivo es Jupiter priceChange24h, igual que el mercado. */}
        <DataRow label={t.detail.change24h}>
          {quoteCellPending ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : quote && Number.isFinite(quote.change24hPct) ? (
            <ChangeBadge value={quote.change24hPct} className="align-middle" />
          ) : (
            <MissingFigure label={t.detail.unavailable} />
          )}
        </DataRow>
        <DataRow label={fill(t.detail.rangeChange, { range: caption })}>
          {historyPending ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : move === null ? (
            <MissingFigure label={rangeMissing} />
          ) : (
            <ChangeBadge value={move} className="align-middle" />
          )}
        </DataRow>
        <DataRow label={fill(t.detail.rangeHigh, { range: caption })}>
          {historyPending ? <Skeleton className="ml-auto h-4 w-20" /> : high === null ? <MissingFigure label={rangeMissing} /> : high}
        </DataRow>
        <DataRow label={fill(t.detail.rangeLow, { range: caption })}>
          {historyPending ? <Skeleton className="ml-auto h-4 w-20" /> : low === null ? <MissingFigure label={rangeMissing} /> : low}
        </DataRow>
        <DataRow label={t.detail.marketPrice}>
          {quoteCellPending ? (
            <Skeleton className="ml-auto h-4 w-20" />
          ) : quote?.marketPriceUsd !== undefined && Number.isFinite(quote.marketPriceUsd) ? (
            moneyText(quote.marketPriceUsd, shownCurrency, rate)
          ) : (
            <MissingFigure label={t.detail.unavailable} />
          )}
        </DataRow>
        <DataRow label={t.detail.poolLiquidity}>
          {quoteCellPending ? (
            <Skeleton className="ml-auto h-4 w-20" />
          ) : quote?.liquidityUsd !== undefined && Number.isFinite(quote.liquidityUsd) ? (
            formatMoney(quote.liquidityUsd, "USD")
          ) : (
            <MissingFigure label={t.detail.unavailable} />
          )}
        </DataRow>
        {/* Ficha del activo: sólo campos que existen en `ticker` (sin cifras inventadas). */}
        <DataRow label={t.detail.issuer} mono={false}>{issuer}</DataRow>
        <DataRow label={t.detail.category} mono={false}>{categoryLabel}</DataRow>
        <DataRow label={t.detail.status} mono={false}>{estadoText}</DataRow>
      </dl>
    </section>
  );
}

export function DetailScreen({
  ticker,
  about,
  initialOperar,
  access,
  tradeBlock = null,
  safetyStatus = "unknown",
  initialQuote = null,
}: {
  ticker: Ticker;
  about: { es: string; en: string } | null;
  initialOperar: string;
  access: DetailAccess;
  tradeBlock?: TradeBlock;
  /** Estado de seguridad del servidor (M54c-fix): `hidden` abre la venta con posición. */
  safetyStatus?: DetailSafetyStatus;
  /** Precio ya resuelto en el server component. El HTML no espera a `/api/prices`. */
  initialQuote?: Quote | null;
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

  const liveQuote =
    prices.data?.find((item) => item.symbol.toLowerCase() === ticker.symbol.toLowerCase()) ?? null;
  const quote = liveQuote ?? initialQuote;
  const points = seriesForQuote(history.data?.points ?? [], quote?.priceUsd);
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
  // M54c-fix: `hidden` con posición abre la ficha (comprar deshabilitado,
  // vender habilitado); sin posición muestra el mismo "no encontrado".
  const isHidden = (live?.safetyStatus ?? safetyStatus) === "hidden";
  const showGone =
    isHidden &&
    (access !== "member" || (portfolio.isSuccess && !canSell));
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
  const reduceMotion = useReducedMotion();

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
    // Con el interruptor apagado, el modo real sigue mostrando el aviso de "próximamente".
    if (isRealAccountUiBlocked(mode)) {
      if (variant === "bar") {
        return (
          <div className="fixed inset-x-0 z-20 border-t border-white/65 bg-white/82 px-4 py-3 backdrop-blur-xl backdrop-saturate-180 shadow-[0_-12px_32px_-12px_rgba(12,15,20,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] min-[400px]:px-5 lg:hidden" style={{ bottom: "var(--app-tabs-height)" }}>
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
          isHidden={isHidden}
          onBuy={() => openOperar("comprar")}
          onSell={() => openOperar("vender")}
          symbol={ticker.symbol}
          underlying={ticker.underlying}
          issuer={ticker.issuer}
          quote={quote}
          currency={currency}
          rate={rate}
          position={position}
          positionPending={portfolio.isPending}
          positionFailed={portfolio.isError}
          onRetryPosition={() => {
            void portfolio.refetch();
          }}
          chipText={chipText}
          chipDot={chipDot}
        />
      );
    }
    if (access === "pending") {
      return (
        <AccountActions
          variant={variant}
          aboveTabs
          primary={{ href: resume, label: t.detail.finishSignup }}
          symbol={ticker.symbol}
          underlying={ticker.underlying}
          issuer={ticker.issuer}
          quote={quote}
          currency={currency}
          rate={rate}
        />
      );
    }
    return (
      <AccountActions
        variant={variant}
        aboveTabs={false}
        primary={{ href: create, label: t.detail.signupToInvest }}
        secondary={{ href: enter, label: t.detail.loginToInvest }}
        symbol={ticker.symbol}
        underlying={ticker.underlying}
        issuer={ticker.issuer}
        quote={quote}
        currency={currency}
        rate={rate}
      />
    );
  }

  // M54c-fix: `hidden` sin posición muestra el mismo "no encontrado" del
  // servidor; con posición la ficha abre con vender habilitado.
  if (showGone) {
    return <NotFoundView kind="ticker" />;
  }

  const contextItems: { key: string; node: ReactNode }[] = [];
  if (category) contextItems.push({ key: "category", node: category });
  if (effectiveBlock !== null) contextItems.push({ key: "blocked", node: t.detail.tradeUnavailable });
  contextItems.push({ key: "token", node: t.detail.tokenOnSolana });
  if (scheduleText) contextItems.push({ key: "schedule", node: scheduleText });

  return (
    <>
    <motion.div
      data-ticker={ticker.symbol}
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-x-16"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex min-w-0 max-w-full flex-col gap-10 pb-36 lg:pb-0">
        <div className="flex min-w-0 flex-col gap-4">
          <Link
            href="/app"
            className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted outline-none transition-colors duration-150 hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <IconBack className="size-4" />
            {t.detail.backToMarket}
          </Link>

          <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <span className="shrink-0">
              <TickerLogo
                symbol={ticker.symbol}
                name={ticker.name}
                logoUrl={ticker.logo}
                size={48}
                decorative
                loading="eager"
                sizes="56px"
              />
            </span>
            <div className="min-w-0 flex-1 basis-44">
              <h1 className="max-w-full text-[27px] leading-[1.08] break-words text-balance sm:text-[32px]">
                {ticker.name}
              </h1>
              <p className="num mt-1.5 max-w-full text-xs leading-5 break-words text-fg-muted">
                <span className="font-medium text-fg">{ticker.symbol}</span>
                <span aria-hidden> · </span>
                <span className="font-sans">
                  <span className="sr-only">{t.detail.underlying} </span>
                  {ticker.underlying}
                </span>
              </p>
            </div>
            <div className="flex w-full min-w-0 items-center justify-end gap-0.5 sm:w-auto sm:basis-auto">
              <span className="mr-auto hidden sm:block">
                <AskAiButton ticker={ticker.symbol} />
              </span>
              <AlertButton labeled={false} symbol={ticker.symbol} name={ticker.name} priceUsd={quote?.priceUsd ?? null} />
              <FavoriteButton pressed={saved} label={favoriteLabel} onToggle={() => toggle(ticker.symbol)} />
              <ShareButton name={ticker.name} />
            </div>
          </header>
        </div>

        {/* En móvil, precio primero: el precio y la única CTA caben en el
            primer pliegue de 360 px. Desde lg el contexto vuelve sobre el gráfico. */}
        <div className="order-1 min-w-0 lg:order-2">
          <PricePanel
            symbol={ticker.symbol}
            name={ticker.name}
            quote={quote}
            pending={prices.isPending && quote === null}
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
            underlying={ticker.underlying}
            avgCostUsd={position?.avgCostUsd ?? null}
          />
        </div>

        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <ul
            className="flex min-w-0 max-w-full list-none flex-wrap items-center gap-x-2.5 gap-y-1 p-0 font-mono text-[13px] leading-4 tracking-[0.06em] text-fg-muted uppercase"
            aria-label={t.detail.chips}
          >
            {contextItems.map((item, index) => (
              <ContextItem key={item.key} separator={index > 0}>
                {item.node}
              </ContextItem>
            ))}
            {statusPending ? (
              <li className="shrink-0">
                <Skeleton className="h-4 w-28" />
              </li>
            ) : statusReady ? (
              <ContextItem separator={contextItems.length > 0}>
                <span className={cn("size-1.5 shrink-0 rounded-full", chipDot)} aria-hidden />
                {chipText}
              </ContextItem>
            ) : null}
            <li className="sm:hidden">
              <Link
                href={`/app/asistente?ticker=${encodeURIComponent(ticker.symbol)}&q=${encodeURIComponent(`Analiza ${ticker.name} (${ticker.symbol}): desempeño, riesgos y contexto actual`)}`}
                className="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
              >
                <svg className="size-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1l1.65 4.35L14 7l-4.35 1.65L8 13l-1.65-4.35L2 7l4.35-1.65L8 1z" />
                </svg>
                {language === "en" ? "Ask the AI" : "Preguntar a la IA"}
              </Link>
            </li>
          </ul>
          {statusReady && chipNote ? (
            <p className="text-[13px] leading-5 text-fg-muted">{chipNote}</p>
          ) : null}
        </div>

        {/* Explicación del gráfico en el asistente y tarjeta para compartir: sin montos. */}
        <div className="flex flex-wrap items-center gap-2">
          <ExplainChartButton ticker={ticker.symbol} name={ticker.name} range={RANGE_QUESTION_LABEL[range]} />
          <ShareCardButton id={ticker.symbol} name={ticker.name} pct={position?.pnlPct ?? null} />
        </div>

        <KeyStats
          quote={quote}
          quotePending={prices.isPending && quote === null}
          points={points}
          historyPending={history.isPending}
          historyError={history.isError}
          range={range}
          currency={currency}
          rate={rate}
          issuer={ticker.issuer}
          categoryLabel={category}
          tradeBlock={effectiveBlock}
        />

        <TokenGapCard symbol={ticker.symbol} quote={quote} />

        {/* Simulador "¿y si hubieras invertido?": se autodescarta sin historial o sin precio. */}
        <WhatIfCalculator
          symbol={ticker.symbol}
          name={ticker.name}
          points={points}
          currentPriceUsd={quote?.priceUsd ?? null}
          currency={currency}
          rate={rate}
        />

        <CompanyCard symbol={ticker.symbol} />

        <section className="flex flex-col gap-3 border-t border-border pt-8">
          <h2 className="text-lg font-medium tracking-tight text-fg">{t.detail.aboutTitle}</h2>
          <p className={NOTE}>{t.detail.aboutNote}</p>
          <p className="max-w-prose text-[15px] leading-relaxed text-pretty text-fg-body">
            {aboutText ?? t.detail.aboutMissing}
          </p>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-8">
          <h2 className="text-lg font-medium tracking-tight text-fg">{t.detail.tokenTitle}</h2>
          <p className="max-w-prose text-sm leading-relaxed text-pretty text-fg-body">
            {fill(t.detail.tokenLead, { issuer: ticker.issuer, brand: site.name, name: ticker.name })}
          </p>
          <dl className="min-w-0 max-w-full">
            <DataRow label={t.detail.issuer} mono={false}>{ticker.issuer}</DataRow>
            <DataRow label={t.detail.multiplier}>
              {quote && Number.isFinite(quote.multiplier) ? (
                formatMultiplier(quote.multiplier)
              ) : (
                <MissingFigure label={t.detail.unavailable} />
              )}
            </DataRow>
            <div className="min-w-0 max-w-full border-b border-border py-3">
              <dt className={METRIC_LABEL}>{t.detail.mint}</dt>
              <dd className="mt-1.5">
                <p className="num text-[13px] leading-5 break-all text-fg">{ticker.mint}</p>
                <p className={cn("mt-1", NOTE)}>{t.detail.mintHint}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <CopyButton value={ticker.mint} label={t.detail.copy} copiedLabel={t.detail.copied} />
                  <a
                    href={solscanMintUrl(ticker.mint)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-sm text-[13px] font-medium text-fg underline underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {t.detail.explorer}
                    <span className="sr-only">. {t.detail.explorerNew}</span>
                  </a>
                </div>
              </dd>
            </div>
          </dl>
          <p className={NOTE}>{t.detail.multiplierHint}</p>
          <div className="mt-2 border-t border-border pt-5">
            <p className="max-w-prose text-sm leading-relaxed text-pretty text-fg-body">{t.detail.risks}</p>
            <Link
              href="/legal/riesgos"
              className="inline-flex min-h-11 w-fit items-center rounded-sm text-[13px] font-medium text-fg underline underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              {t.detail.risksLink}
            </Link>
          </div>
        </section>

        <OnchainVerificationCard
          symbol={ticker.symbol}
          name={ticker.name}
          mint={ticker.mint}
          issuer={ticker.issuer}
          underlying={ticker.underlying}
          multiplier={quote?.multiplier ?? null}
        />

        <StockTokenGuide />
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-6">{tradeSlot("card")}</div>
      </aside>

    </motion.div>

      {tradeSlot("bar")}

      {access === "member" &&
      operar !== null &&
      (effectiveBlock === null || (effectiveBlock === "review" && canSell && operar === "vender")) ? (
        <TradeSheet
          ticker={ticker}
          side={operar === "vender" ? "sell" : "buy"}
          open
          onOpenChange={(open) => {
            if (!open) openOperar(null);
          }}
        />
      ) : null}
    </>
  );
}
