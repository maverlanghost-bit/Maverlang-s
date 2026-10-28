"use client";

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { ActivityItem } from "@/components/domain/activity-item";
import { AllocationBar, type AllocationSlice } from "@/components/domain/allocation-bar";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { SvgPriceChart } from "@/components/domain/svg-price-chart";
import { InfoTip } from "@/components/domain/info-tip";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { PositionRow } from "@/components/domain/position-row";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { ResetDemoButton } from "@/components/domain/reset-demo-button";
import { carteraCopy, type CarteraExtra } from "@/content/i18n/extra-cartera";
import type { BadgeTone } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatMoney, formatShares, type MoneyCurrency } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { DEMO_INITIAL_USD } from "@/lib/services/demo.logic";
import { useActivity, useAssetStatus, useFx, useHistories, usePortfolio, useTickers } from "@/lib/hooks/queries";
import { priceFlashDirection, type PriceFlash } from "@/lib/hooks/use-price-flash";
import { useT } from "@/lib/hooks/use-t";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { displayPrice } from "@/lib/market/browse";
import { DETAIL_RANGES, isDetailRange, isReferenceHistory, rangeMove, toneOf } from "@/lib/market/series";
import { periodPerformance, portfolioPerformance, type PortfolioPerformance, type RankedPosition } from "@/lib/portfolio/performance";
import { balancedPortions, decodePoints, encodePoints, portfolioValueSeries, sumUsd, sumsMatch, tradeActivity } from "@/lib/portfolio/series";
import type { Activity, Currency, OrderStatus, Position, Range, Ticker } from "@/lib/types";

const DEPOSIT_HREF = "/app/billetera/depositar";
const SEND_HREF = "/app/billetera/enviar";
const MARKET_HREF = "/app";

const POSITION_COLORS = ["#0a0a0a", "#ff6a08", "#1c7c5b", "#2b7fd9", "#99651a", "#5c6570", "#cc2c55", "#3d6b58"] as const;
const CASH_COLOR = "#c5cad3";

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: "warn",
  submitted: "warn",
  confirmed: "up",
  failed: "down",
  expired: "neutral",
};

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

function tickerHref(symbol: string) {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

function sellHref(symbol: string) {
  return `/app/accion/${encodeURIComponent(symbol)}?operar=vender`;
}

function explorerTxUrl(signature: string) {
  return `https://solscan.io/tx/${encodeURIComponent(signature)}`;
}

function moneyView(usd: number, currency: Currency, rate: number | undefined): { amount: number; currency: MoneyCurrency } {
  if (currency === "CLP") {
    const converted = displayPrice(usd, "CLP", rate);
    if (converted !== null) return { amount: converted, currency: "CLP" };
  }
  return { amount: usd, currency: "USD" };
}

/**
 * Aviso de seguridad por posición (M54c-fix): `hidden` muestra que ya no se
 * puede comprar pero sí vender. El chip "En revisión" sigue a `underReview`
 * (las Ondo aprobadas quedan en `watch` en la base, pero sin chip).
 * El botón Vender de la fila sigue disponible en ambos casos.
 */
function PositionSafetyNote({ symbol }: { symbol: string }) {
  const { t } = useT();
  const asset = useAssetStatus(symbol);
  const notice =
    asset.data?.safetyStatus === "hidden" ? "hidden" : asset.data?.underReview ? "review" : null;
  if (notice === null) return null;
  if (notice === "hidden") {
    return <p className="px-2 pb-2 text-sm leading-relaxed text-fg-muted">{t.portfolio.hiddenNotice}</p>;
  }
  return (
    <p className="px-2 pb-2">
      <Badge tone="warn">{t.market.underReview}</Badge>
    </p>
  );
}

function EmptyArt() {
  return (
    <svg viewBox="0 0 80 64" className="size-16 text-fg-muted" fill="none" aria-hidden>
      <rect x="8.5" y="16.5" width="63" height="38" rx="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 44.5 32 32.5l10 8 16-16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="58" cy="24.5" r="3" className="fill-brand" />
    </svg>
  );
}

function Masked({ label, className }: { label: string; className?: string }) {
  return (
    <span className={className}>
      <span className="num tracking-[0.18em]" aria-hidden>
        ••••••
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function orderDetail(
  row: Activity,
  currency: Currency,
  rate: number | undefined,
  hidden: boolean,
  hiddenLabel: string,
  pendingFx: boolean,
): ReactNode {
  const shares = formatShares(row.amountUi);
  if (hidden) {
    return (
      <>
        {shares}
        {" · "}
        <Masked label={hiddenLabel} />
      </>
    );
  }
  if (row.valueUsd === null || pendingFx) return shares;
  const view = moneyView(row.valueUsd, currency, rate);
  return `${shares} · ${formatMoney(view.amount, view.currency)}`;
}

function signClass(value: number, size: "sm" | "lg"): string {
  const scale = size === "lg" ? "text-lg" : "text-sm";
  if (value > 0) return `num ${scale} text-up`;
  if (value < 0) return `num ${scale} text-down`;
  return `num ${scale} text-fg`;
}

function MoneyLine({
  usd,
  currency,
  rate,
  pendingFx,
  masked,
  hiddenLabel,
  size = "lg",
}: {
  usd: number;
  currency: Currency;
  rate: number | undefined;
  pendingFx: boolean;
  masked: boolean;
  hiddenLabel: string;
  size?: "sm" | "lg";
}) {
  if (masked) return <Masked label={hiddenLabel} className={size === "lg" ? "text-lg" : "text-sm"} />;
  if (pendingFx) return <Skeleton className={size === "lg" ? "h-7 w-28" : "h-5 w-20"} />;
  const view = moneyView(usd, currency, rate);
  return <span className={signClass(usd, size)}>{formatMoney(view.amount, view.currency)}</span>;
}

function SummaryCard({ title, tip, copy, children }: { title: string; tip: string; copy: CarteraExtra; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4 md:p-5">
      <div className="flex items-center justify-between gap-1">
        <p className="label">{title}</p>
        <InfoTip label={`${copy.whatIsThis}. ${title}`} text={tip} />
      </div>
      {children}
    </Card>
  );
}

function RankLine({
  rank,
  name,
  currency,
  rate,
  pendingFx,
  masked,
  hiddenLabel,
  empty,
}: {
  rank: RankedPosition | null;
  name: string | null;
  currency: Currency;
  rate: number | undefined;
  pendingFx: boolean;
  masked: boolean;
  hiddenLabel: string;
  empty: string;
}) {
  if (!rank || !name) return <span className="text-sm text-fg-muted">{empty}</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="max-w-full truncate text-sm font-medium text-fg">{name}</span>
      {rank.pnlUsd === null ? null : (
        <MoneyLine
          usd={rank.pnlUsd}
          currency={currency}
          rate={rate}
          pendingFx={pendingFx}
          masked={masked}
          hiddenLabel={hiddenLabel}
          size="sm"
        />
      )}
      {masked ? <Masked label={hiddenLabel} /> : <ChangeBadge value={rank.pnlPct} />}
    </div>
  );
}

function SummaryCards({
  copy,
  perf,
  totalUsd,
  currency,
  rate,
  pendingFx,
  masked,
  hiddenLabel,
  bestName,
  worstName,
}: {
  copy: CarteraExtra;
  perf: PortfolioPerformance;
  totalUsd: number;
  currency: Currency;
  rate: number | undefined;
  pendingFx: boolean;
  masked: boolean;
  hiddenLabel: string;
  bestName: string | null;
  worstName: string | null;
}) {
  return (
    <section aria-label={copy.summaryLabel} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <SummaryCard title={copy.currentValue} tip={copy.currentTip} copy={copy}>
          <MoneyLine usd={totalUsd} currency={currency} rate={rate} pendingFx={pendingFx} masked={masked} hiddenLabel={hiddenLabel} />
        </SummaryCard>
        <SummaryCard title={copy.invested} tip={copy.investedTip} copy={copy}>
          {perf.investedUsd === null ? (
            <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
          ) : (
            <MoneyLine usd={perf.investedUsd} currency={currency} rate={rate} pendingFx={pendingFx} masked={masked} hiddenLabel={hiddenLabel} />
          )}
        </SummaryCard>
        <SummaryCard title={copy.totalGain} tip={copy.totalGainTip} copy={copy}>
          {perf.gainUsd === null ? (
            <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
          ) : (
            <MoneyLine usd={perf.gainUsd} currency={currency} rate={rate} pendingFx={pendingFx} masked={masked} hiddenLabel={hiddenLabel} />
          )}
        </SummaryCard>
        <SummaryCard title={copy.totalPct} tip={copy.totalPctTip} copy={copy}>
          {perf.gainPct === null ? (
            <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
          ) : masked ? (
            <Masked label={hiddenLabel} />
          ) : (
            <ChangeBadge value={perf.gainPct} />
          )}
        </SummaryCard>
        <SummaryCard title={copy.best} tip={copy.bestTip} copy={copy}>
          <RankLine
            rank={perf.best}
            name={bestName}
            currency={currency}
            rate={rate}
            pendingFx={pendingFx}
            masked={masked}
            hiddenLabel={hiddenLabel}
            empty={copy.emptyFigure}
          />
        </SummaryCard>
        <SummaryCard title={copy.worst} tip={copy.worstTip} copy={copy}>
          <RankLine
            rank={perf.worst}
            name={worstName}
            currency={currency}
            rate={rate}
            pendingFx={pendingFx}
            masked={masked}
            hiddenLabel={hiddenLabel}
            empty={copy.emptyFigure}
          />
        </SummaryCard>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">{copy.disclaimer}</p>
    </section>
  );
}

const ValueChart = memo(function ValueChart({
  positions,
  cashUsdc,
  totalUsd,
  onHover,
  currency,
  rate,
  pendingFx,
}: {
  positions: readonly Position[];
  cashUsdc: number;
  totalUsd: number;
  onHover: (usd: number | null) => void;
  currency: Currency;
  rate: number | undefined;
  pendingFx: boolean;
}) {
  const { t, language } = useT();
  const copy = carteraCopy(language);
  const [range, setRange] = useState<Range>("1M");
  const symbols = useMemo(() => positions.map((position) => position.symbol), [positions]);
  const histories = useHistories(symbols, range);
  const rows = histories.map((query) => query.data?.points ?? []);
  const ready = rows.length === positions.length && rows.every((row) => row.length >= 2);
  const encoded = encodePoints(ready ? portfolioValueSeries(positions, rows, cashUsdc, totalUsd) : []);
  const points = useMemo(() => decodePoints(encoded), [encoded]);
  const pending = histories.some((query) => query.isPending);
  const failed = histories.some((query) => query.isError);
  // Si alguna historia usada es mock (o no está marcada real), la curva
  // mezclada tampoco es un precio real.
  const reference =
    !pending && !failed && points.length >= 2 && histories.some((query) => isReferenceHistory(query.data));
  const rangeOptions = DETAIL_RANGES.map((value) => ({ value, label: t.detail.rangeShort[value] }));
  const period = points.length >= 2 ? periodPerformance(points) : null;
  const periodMoney = period === null ? null : moneyView(period.deltaUsd, currency, rate);

  return (
    <>
      <SegmentedControl
        label={t.detail.rangesLabel}
        options={rangeOptions}
        value={range}
        fullWidth
        onChange={(value) => {
          if (!isDetailRange(value)) return;
          setRange(value);
          onHover(null);
        }}
      />
      {reference ? <p className="text-sm text-fg-muted">{t.detail.chartReference}</p> : null}
      {!pending && !failed ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">{copy.period}</span>
            <span className="text-sm text-fg-muted">{t.detail.rangeCaption[range]}</span>
            <InfoTip label={`${copy.whatIsThis}. ${copy.period}`} text={copy.periodTip} align="start" />
            {period === null || periodMoney === null ? (
              <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
            ) : pendingFx ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              <>
                <span className={signClass(period.deltaUsd, "sm")}>{formatMoney(periodMoney.amount, periodMoney.currency)}</span>
                <ChangeBadge value={period.pct} />
              </>
            )}
          </div>
          {period !== null ? <p className="text-xs leading-relaxed text-fg-muted">{copy.disclaimer}</p> : null}
        </div>
      ) : null}
      {pending ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{t.states.loading}</span>
          <Skeleton className="h-56 w-full rounded-xl lg:h-72" />
        </div>
      ) : failed ? (
        <ErrorState
          title={t.detail.chartError}
          label={t.states.error}
          retryLabel={t.states.retry}
          onRetry={() => {
            for (const query of histories) void query.refetch();
          }}
        />
      ) : (
        <SvgPriceChart
          points={points}
          tone={toneOf(rangeMove(points))}
          label={fill(t.portfolio.chartLabel, { range: t.detail.rangeCaption[range] })}
          emptyLabel={t.detail.chartEmpty}
          emptyHint={t.detail.chartEmptyHint}
          onHover={onHover}
          reference={reference}
        />
      )}
    </>
  );
});

export function PortfolioScreen() {
  const { t, currency, language } = useT();
  const { hidden } = useHideBalance();
  const { mode } = useAccountMode();
  const portfolio = usePortfolio(mode === "demo");
  const activity = useActivity();
  const tickers = useTickers();
  const fx = useFx();
  const [hoverUsd, setHoverUsd] = useState<number | null>(null);
  const onHoverUsd = useCallback((usd: number | null) => {
    setHoverUsd((current) => (current === usd ? current : usd));
  }, []);

  const tickerBySymbol = useMemo(() => {
    const map = new Map<string, Ticker>();
    for (const ticker of tickers.data ?? []) map.set(ticker.symbol, ticker);
    return map;
  }, [tickers.data]);

  const loaded = portfolio.data;
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const pendingFx = currency === "CLP" && !fxKnown && fx.isPending;
  const showFxNote = currency === "CLP" && !fxKnown && !fx.isPending;
  const masked = hidden === true;
  const page = t.pages.portfolio;

  if (mode === "real") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={page.title} description={page.lead} />
        <RealAccountEmpty />
      </div>
    );
  }

  let body: ReactNode;
  if (portfolio.isPending) {
    body = (
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-56 w-full rounded-xl lg:h-72" />
        <Skeleton className="h-36 w-full rounded-3xl" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    );
  } else if (portfolio.isError || !loaded) {
    body = (
      <ErrorState
        title={t.portfolio.loadError}
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={() => {
          void portfolio.refetch();
        }}
      />
    );
  } else {
    const positionSum = sumUsd(loaded.positions.map((position) => position.valueUsd));
    const shownUsd = hoverUsd ?? loaded.totalUsd;
    const shown = moneyView(shownUsd, currency, rate);
    // N18: igual que en el detalle, el total sólo se tiñe contra el actual.
    const hoverForce: PriceFlash | undefined =
      hoverUsd !== null ? priceFlashDirection(loaded.totalUsd, hoverUsd, "usd", "usd") : undefined;
    const pnl = loaded.pnlUsd === null ? null : moneyView(loaded.pnlUsd, currency, rate);
    const sliceInputs: { key: string; label: string; valueUsd: number; color: string }[] = [];
    for (const position of loaded.positions) {
      if (!(position.valueUsd > 0)) continue;
      sliceInputs.push({
        key: position.symbol,
        label: tickerBySymbol.get(position.symbol)?.name ?? position.symbol,
        valueUsd: position.valueUsd,
        color: POSITION_COLORS[sliceInputs.length % POSITION_COLORS.length] ?? "#0a0a0a",
      });
    }
    if (loaded.cashUsdc > 0) {
      sliceInputs.push({ key: "USDC", label: t.portfolio.cashSlice, valueUsd: loaded.cashUsdc, color: CASH_COLOR });
    }
    const portions = balancedPortions(
      sliceInputs.map((slice) => slice.valueUsd),
      loaded.totalUsd,
    );
    const slices: AllocationSlice[] = sliceInputs.map((slice, index) => {
      const view = moneyView(slice.valueUsd, currency, rate);
      return {
        key: slice.key,
        label: slice.label,
        pct: portions[index] ?? 0,
        color: slice.color,
        valueLabel: masked ? "••••" : pendingFx ? "…" : formatMoney(view.amount, view.currency),
      };
    });

    const orders = tradeActivity(activity.data ?? []);
    const cashView = moneyView(loaded.cashUsdc, currency, rate);
    const copy = carteraCopy(language);
    const perf = portfolioPerformance(loaded.positions, { pnlUsd: loaded.pnlUsd, pnlPct: loaded.pnlPct });
    const bestName = perf.best ? (tickerBySymbol.get(perf.best.symbol)?.name ?? perf.best.symbol) : null;
    const worstName = perf.worst ? (tickerBySymbol.get(perf.worst.symbol)?.name ?? perf.worst.symbol) : null;

    body = (
      <div
        className="flex flex-col gap-8"
        data-total={loaded.totalUsd}
        data-cash={loaded.cashUsdc}
        data-positions={positionSum}
        data-reconciled={sumsMatch(positionSum + loaded.cashUsdc, loaded.totalUsd) ? "1" : "0"}
      >
        <SummaryCards
          copy={copy}
          perf={perf}
          totalUsd={loaded.totalUsd}
          currency={currency}
          rate={rate}
          pendingFx={pendingFx}
          masked={masked}
          hiddenLabel={t.shell.balanceHidden}
          bestName={bestName}
          worstName={worstName}
        />
        <section className="flex flex-col gap-4">
          <div>
            <p className="label">{t.portfolio.total}</p>
            <div className="mt-1 mb-2">
              {masked ? (
                <Masked label={t.shell.balanceHidden} className="text-4xl tracking-tight sm:text-5xl" />
              ) : pendingFx ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <span className="block font-medium">
                  <FlashPrice value={shown.amount} currency={shown.currency} size="lg" live={hoverUsd === null} force={hoverForce} />
                </span>
              )}
            </div>
            <PriceFreshness at={portfolio.dataUpdatedAt || loaded.updatedAt} delayedOnly />
            {showFxNote ? <p className="mt-2 text-sm text-fg-muted">{t.detail.fxFallback}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="label">{t.portfolio.pnl}</span>
            {masked ? (
              <Masked label={t.shell.balanceHidden} />
            ) : pendingFx ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              <>
                {pnl === null ? (
                  <span className="num text-sm text-fg-muted">—</span>
                ) : (
                  <FlashPrice value={pnl.amount} currency={pnl.currency} size="sm" colorBySign />
                )}
                {loaded.pnlPct === null ? <span className="num text-sm text-fg-muted">—</span> : <ChangeBadge value={loaded.pnlPct} />}
              </>
            )}
          </div>

          {loaded.positions.length > 0 && !masked ? (
            <ValueChart
              positions={loaded.positions}
              cashUsdc={loaded.cashUsdc}
              totalUsd={loaded.totalUsd}
              onHover={onHoverUsd}
              currency={currency}
              rate={rate}
              pendingFx={pendingFx}
            />
          ) : null}
        </section>

        {loaded.positions.length === 0 ? (
          <EmptyState
            media={<EmptyArt />}
            title={t.portfolio.emptyTitle}
            description={t.portfolio.emptyBody}
            action={
              <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href={MARKET_HREF}>{t.portfolio.explore}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <nav aria-label="Accesos rápidos" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href={MARKET_HREF}>{t.portfolio.explore}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href={DEPOSIT_HREF}>{t.trade.deposit}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href={SEND_HREF}>{t.wallet.send}</Link>
              </Button>
            </nav>
            {slices.length > 0 ? (
              <Card>
                <h2 className="text-lg font-semibold tracking-tight">{t.portfolio.allocation}</h2>
                <div className="mt-4">
                  <AllocationBar label={t.portfolio.allocationLabel} slices={slices} />
                </div>
              </Card>
            ) : null}
            <Card>
              <h2 className="text-lg font-semibold tracking-tight">{t.portfolio.positions}</h2>
              <ul className="mt-2 divide-y divide-border/60">
                {loaded.positions.map((position) => {
                  const ticker = tickerBySymbol.get(position.symbol);
                  const value = moneyView(position.valueUsd, currency, rate);
                  const pnlValue = position.pnlUsd === null ? null : moneyView(position.pnlUsd, currency, rate);
                  return (
                    <li key={position.symbol}>
                      <PositionRow
                        href={tickerHref(position.symbol)}
                        symbol={position.symbol}
                        name={ticker?.name ?? position.symbol}
                        logoUrl={ticker?.logo || logoPathFromSymbol(position.symbol)}
                        shares={position.shares}
                        shareHint={t.portfolio.shareHint}
                        value={value.amount}
                        currency={value.currency}
                        pnl={pnlValue === null ? null : pnlValue.amount}
                        pnlPct={position.pnlPct}
                        hidden={masked}
                        hiddenLabel={t.shell.balanceHidden}
                        pending={pendingFx}
                        action={
                          position.shares > 0 ? (
                            <div className="flex shrink-0 justify-end px-2 pb-2 sm:items-center sm:px-1 sm:pb-0">
                              <Button asChild variant="secondary" size="sm" className="min-h-11 whitespace-nowrap px-4">
                                <Link
                                  href={sellHref(position.symbol)}
                                  aria-label={fill(t.detail.tradeSell, { name: ticker?.name ?? position.symbol })}
                                >
                                  {t.detail.sell}
                                </Link>
                              </Button>
                            </div>
                          ) : null
                        }
                      />
                      {position.avgCostUsd !== null && Number.isFinite(position.avgCostUsd) ? (
                        <p className="flex flex-wrap items-center gap-2 px-2 pb-2 text-sm text-fg-muted">
                          <span>{copy.avgCost}</span>
                          <InfoTip label={`${copy.whatIsThis}. ${copy.avgCost}`} text={copy.avgCostTip} align="start" />
                          <MoneyLine
                            usd={position.avgCostUsd}
                            currency={currency}
                            rate={rate}
                            pendingFx={pendingFx}
                            masked={masked}
                            hiddenLabel={t.shell.balanceHidden}
                            size="sm"
                          />
                        </p>
                      ) : null}
                      <PositionSafetyNote symbol={position.symbol} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        )}

        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.portfolio.available}</h2>
            <div className="mt-2">
              {masked ? (
                <Masked label={t.shell.balanceHidden} className="text-2xl" />
              ) : pendingFx ? (
                <Skeleton className="h-8 w-36" />
              ) : (
                <span className="block font-medium">
                  <FlashPrice value={cashView.amount} currency={cashView.currency} size="md" />
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-fg-muted">{t.portfolio.availableNote}</p>
          </div>
          <Button asChild className="min-h-11 px-6">
            <Link href={DEPOSIT_HREF}>{t.trade.deposit}</Link>
          </Button>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold tracking-tight">{t.portfolio.history}</h2>
          <div className="mt-2">
            {activity.isPending ? (
              <div role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">{t.states.loading}</span>
                <Skeleton className="h-16 w-full" />
              </div>
            ) : activity.isError ? (
              <ErrorState
                title={t.portfolio.historyError}
                label={t.states.error}
                retryLabel={t.states.retry}
                onRetry={() => {
                  void activity.refetch();
                }}
              />
            ) : orders.length === 0 ? (
              <p className="py-4 text-sm text-fg-muted">{t.portfolio.historyEmpty}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {orders.map((row) => {
                  const name = tickerBySymbol.get(row.symbol)?.name ?? row.symbol;
                  const kind = row.kind === "buy" ? t.portfolio.buy : t.portfolio.sell;
                  return (
                    <li key={row.id}>
                      <ActivityItem
                        title={`${kind} · ${name}`}
                        detail={orderDetail(row, currency, rate, masked, t.shell.balanceHidden, pendingFx)}
                        time={formatDateTime(row.at)}
                        dateTime={row.at}
                        status={t.portfolio.status[row.status]}
                        tone={STATUS_TONE[row.status]}
                        explorerHref={row.signature ? explorerTxUrl(row.signature) : null}
                        explorerLabel={t.trade.explorer}
                        explorerNew={t.trade.explorerNew}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={page.title} description={page.lead} />
      {mode === "demo" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs leading-relaxed text-fg-muted">
              <Badge tone="warn">{t.account.badge}</Badge>
              <span>{t.account.note}</span>
            </p>
            <ResetDemoButton />
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">
            {currency === "CLP" && fxKnown && typeof rate === "number"
              ? fill(t.account.demoBalanceClp, {
                  amount: new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(
                    DEMO_INITIAL_USD * rate,
                  ),
                })
              : t.account.demoBalance}
          </p>
        </div>
      ) : null}
      {body}
    </div>
  );
}
