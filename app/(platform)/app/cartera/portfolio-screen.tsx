"use client";

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { ActivityItem } from "@/components/domain/activity-item";
import { AllocationBar, type AllocationItem, type AllocationSlice } from "@/components/domain/allocation-bar";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { InfoTip } from "@/components/domain/info-tip";
import { InvestmentHistory } from "@/components/domain/investment-history";
import { PortfolioDonut } from "@/components/domain/portfolio-donut";
import { PortfolioHealthCard } from "@/components/domain/portfolio-health-card";
import { PortfolioTaxSummaryCard } from "@/components/domain/portfolio-tax-summary-card";
import { PortfolioValueChart, isPortfolioRange, usePortfolioValueSeries } from "@/components/domain/portfolio-value-chart";
import { DividendMultiplierCard } from "@/components/domain/dividend-multiplier-card";
import { PositionRow, POSITION_ACTION_WIDTH, POSITION_ROW_GRID } from "@/components/domain/position-row";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { ResetDemoButton } from "@/components/domain/reset-demo-button";
import { SvgPriceChart } from "@/components/domain/svg-price-chart";
import { TradeReceiptTrigger } from "@/components/domain/trade-receipt-modal";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { carteraCopy, type CarteraExtra } from "@/content/i18n/extra-cartera";
import { carteraUi } from "@/content/i18n/extra-cartera2";
import { isRealAccountUiBlocked, isRealAccountUiEnabled } from "@/lib/account/real-ui-gate";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { positionMeta } from "@/lib/catalog/position-meta";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatShares, type MoneyCurrency } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import {
  useActivity,
  useAssetStatuses,
  useFx,
  useHistories,
  useHistory,
  usePortfolio,
  useTickers,
} from "@/lib/hooks/queries";
import { priceFlashDirection, type PriceFlash } from "@/lib/hooks/use-price-flash";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import type { AssetStatus } from "@/lib/market/asset-status.shared";
import { DETAIL_RANGES, isDetailRange, isReferenceHistory, rangeMove, toneOf } from "@/lib/market/series";
import { portfolioPerformance, type PortfolioPerformance } from "@/lib/portfolio/performance";
import { balancedPortions, sumUsd, sumsMatch, tradeActivity } from "@/lib/portfolio/series";
import { DEMO_INITIAL_USD } from "@/lib/services/demo.logic";
import type { Activity, Currency, OrderStatus, Position, Range, Ticker } from "@/lib/types";

const DEPOSIT_HREF = "/app/billetera/depositar";
const SEND_HREF = "/app/billetera/enviar";
const MARKET_HREF = "/app";

const POSITION_COLORS = ["#059669", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#10b981", "#6366f1"] as const;
const CASH_COLOR = "#64748b";

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: "warn",
  submitted: "warn",
  confirmed: "up",
  failed: "down",
  expired: "neutral",
};

/**
 * El comprobante sólo conoce cuatro estados. `expired` (orden que nunca se
 * firmó) no tiene comprobante propio: se muestra como pendiente para no
 * inventar un estado que el recibo no sabe representar.
 */
type ReceiptStatus = "pending" | "submitted" | "confirmed" | "failed";

const RECEIPT_STATUS: Record<OrderStatus, ReceiptStatus> = {
  pending: "pending",
  submitted: "submitted",
  confirmed: "confirmed",
  failed: "failed",
  expired: "pending",
};

function receiptStatusOf(status: OrderStatus): ReceiptStatus {
  return RECEIPT_STATUS[status] ?? "pending";
}

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

function tickerHref(symbol: string) {
  const base = positionMeta(symbol) ? "/app/cripto" : "/app/accion";
  return `${base}/${encodeURIComponent(symbol)}`;
}

function sellHref(symbol: string) {
  return `${tickerHref(symbol)}?operar=vender`;
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
 * El estado llega del lote de la cartera: una sola petición para todas las
 * posiciones. Si ese símbolo falló (`undefined`), la fila no muestra aviso.
 * El botón Vender de la fila sigue disponible en ambos casos.
 */
function PositionSafetyNote({ status }: { status: AssetStatus | undefined }) {
  const { t } = useT();
  const notice =
    status?.safetyStatus === "hidden" ? "hidden" : status?.underReview ? "review" : null;
  if (notice === null) return null;
  if (notice === "hidden") {
    return (
      <p className="pb-3 pl-12 text-[13px] leading-relaxed text-fg-muted sm:pl-[3.25rem]">
        {t.portfolio.hiddenNotice}
      </p>
    );
  }
  return (
    <p className="pb-3 pl-12 sm:pl-[3.25rem]">
      <Badge tone="warn">{t.market.underReview}</Badge>
    </p>
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
  const scale = size === "lg" ? "text-lg" : "text-[12px]";
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
  if (masked) return <Masked label={hiddenLabel} className={size === "lg" ? "text-lg" : "text-[12px]"} />;
  if (pendingFx) return <Skeleton className={size === "lg" ? "h-7 w-28" : "h-4 w-20"} />;
  const view = moneyView(usd, currency, rate);
  return <span className={signClass(usd, size)}>{formatMoney(view.amount, view.currency)}</span>;
}

/**
 * Hero patrimonial: el valor total manda, la ganancia y lo invertido lo
 * acompañan, y el saldo disponible queda como dato secundario junto al único
 * CTA primario de la vista.
 */
function PatrimonyHero({
  copy,
  perf,
  shownUsd,
  cashUsdc,
  hoverActive,
  hoverForce,
  currency,
  rate,
  pendingFx,
  masked,
  hiddenLabel,
  onChart,
  summaryTip,
  freshnessAt,
}: {
  copy: CarteraExtra;
  perf: PortfolioPerformance;
  shownUsd: number;
  cashUsdc: number;
  hoverActive: boolean;
  hoverForce: PriceFlash | undefined;
  currency: Currency;
  rate: number | undefined;
  pendingFx: boolean;
  masked: boolean;
  hiddenLabel: string;
  onChart: string;
  summaryTip: string;
  freshnessAt: string | number | undefined;
}) {
  const { t } = useT();
  const shown = moneyView(shownUsd, currency, rate);
  const gain = perf.gainUsd === null ? null : moneyView(perf.gainUsd, currency, rate);
  const invested = perf.investedUsd === null ? null : moneyView(perf.investedUsd, currency, rate);
  const cash = moneyView(cashUsdc, currency, rate);
  const hasCash = cashUsdc > 0;

  const primary = hasCash
    ? { href: MARKET_HREF, label: t.portfolio.explore }
    : { href: DEPOSIT_HREF, label: t.trade.deposit };
  const secondary = hasCash
    ? { href: DEPOSIT_HREF, label: t.trade.deposit }
    : { href: MARKET_HREF, label: t.portfolio.explore };

  return (
    <section aria-label={copy.summaryLabel} className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <h2 className="label">{copy.currentValue}</h2>
        <InfoTip label={`${copy.whatIsThis}. ${copy.summaryLabel}`} text={summaryTip} align="start" />
      </div>

      <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-12">
        <div className="min-w-0">
          {masked ? (
            <Masked label={hiddenLabel} className="num block text-[2.5rem] tracking-[0.14em] sm:text-[3.5rem]" />
          ) : pendingFx ? (
            <Skeleton className="h-12 w-64 max-w-full sm:h-14" />
          ) : (
            <span className="-ml-1 block">
              <FlashPrice
                value={shown.amount}
                currency={shown.currency}
                size="lg"
                live={!hoverActive}
                force={hoverForce}
                className="block text-[2.5rem] leading-none font-medium tracking-tight sm:text-[3.5rem]"
              />
            </span>
          )}
          <p className="mt-2 h-4 text-xs text-fg-subtle">{hoverActive && !masked ? onChart : ""}</p>
        </div>

        <dl className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="min-w-0">
            <dt className="label">{copy.totalGain}</dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-2">
              {gain === null ? (
                <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
              ) : masked ? (
                <Masked label={hiddenLabel} className="num text-lg" />
              ) : pendingFx ? (
                <Skeleton className="h-6 w-28" />
              ) : (
                <FlashPrice
                  value={gain.amount}
                  currency={gain.currency}
                  size="sm"
                  colorBySign
                  className="text-lg font-medium tracking-tight sm:text-xl"
                />
              )}
              {perf.gainPct === null || masked ? null : <ChangeBadge value={perf.gainPct} />}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="label">{copy.invested}</dt>
            <dd className="num mt-1.5 text-[15px] font-medium tracking-tight text-fg">
              {invested === null
                ? copy.emptyFigure
                : masked
                  ? "••••"
                  : pendingFx
                    ? "…"
                    : formatMoney(invested.amount, invested.currency)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 flex flex-col gap-5 border-t border-border pt-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <h2 className="label">{t.portfolio.available}</h2>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="num text-xl font-medium tracking-tight text-fg">
              {masked ? "••••" : pendingFx ? "…" : formatMoney(cash.amount, cash.currency)}
            </span>
            <span className="text-[13px] text-fg-muted">{t.portfolio.availableNote}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <nav aria-label="Accesos rápidos" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button asChild size="lg" className="col-span-2 min-h-11 sm:col-span-1">
              <Link href={primary.href}>{primary.label}</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="min-h-11">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
            <Link
              href={SEND_HREF}
              className="inline-flex min-h-11 items-center justify-center text-[13px] font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline sm:px-3 lg:justify-start"
            >
              {t.wallet.send}
            </Link>
          </nav>
          <PriceFreshness at={freshnessAt} delayedOnly />
        </div>
      </div>
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
  const { t } = useT();
  const [range, setRange] = useState<Range>("1M");
  const [compareSpy, setCompareSpy] = useState(false);
  const spyHistory = useHistory(compareSpy ? "SPYx" : "", range);
  const symbols = useMemo(() => positions.map((position) => position.symbol), [positions]);
  const histories = useHistories(symbols, range);
  const rows = histories.map((query) => query.data?.points ?? []);
  const points = usePortfolioValueSeries(positions, rows, cashUsdc, totalUsd);
  const pending = histories.some((query) => query.isPending);
  const failed = histories.some((query) => query.isError);
  // Si alguna historia usada es mock (o no está marcada real), la curva
  // mezclada tampoco es un precio real.
  const reference =
    !pending && !failed && points.length >= 2 && histories.some((query) => isReferenceHistory(query.data));
  const benchmark = useMemo(() => {
    if (!compareSpy) return null;
    const data = spyHistory.data;
    const pts = data?.points ?? [];
    if (pts.length < 2) return null;
    // Misma naturaleza de dato: no se compara una cartera demo contra el índice
    // real (ni al revés), porque el eje Y pasa a porcentaje y la mezcla mentiría.
    if (reference !== isReferenceHistory(data)) return null;
    return { label: "S&P 500 (SPYx)", points: pts };
  }, [compareSpy, reference, spyHistory.data]);

  // Sólo los cuatro rangos de la cartera: 1S, 1M, 3M y 1A. El 1D y el "Todo"
  // siguen disponibles en la ficha de cada acción.
  const rangeOptions = useMemo(
    () =>
      DETAIL_RANGES.filter((value) => isPortfolioRange(value)).map((value) => ({
        value,
        label: t.detail.rangeShort[value],
      })),
    [t],
  );
  const formatValue = useCallback(
    (usd: number) => {
      const view = moneyView(usd, currency, rate);
      return formatMoney(view.amount, view.currency);
    },
    [currency, rate],
  );

  return (
    <PortfolioValueChart
      ranges={rangeOptions}
      range={range}
      onRangeChange={(value) => {
        if (!isDetailRange(value)) return;
        setRange(value);
        onHover(null);
      }}
      points={points}
      formatValue={formatValue}
      pendingFx={pendingFx}
      compare={{ active: compareSpy, onToggle: () => setCompareSpy((prev) => !prev) }}
      pending={pending}
      failed={failed}
      onRetry={() => {
        for (const query of histories) void query.refetch();
      }}
      referenceNote={reference ? t.detail.chartReference : null}
    >
      <SvgPriceChart
        points={points}
        tone={toneOf(rangeMove(points))}
        label={fill(t.portfolio.chartLabel, { range: t.detail.rangeCaption[range] })}
        emptyLabel={t.detail.chartEmpty}
        emptyHint={t.detail.chartEmptyHint}
        heightClassName="h-60 sm:h-72 lg:h-[360px]"
        onHover={onHover}
        reference={reference}
        benchmark={benchmark}
      />
    </PortfolioValueChart>
  );
});

export function PortfolioScreen() {
  const { t, currency, language } = useT();
  const { hidden } = useHideBalance();
  const { mode } = useAccountMode();
  // En modo real la cartera sólo se consulta si la UI real está desbloqueada;
  // por defecto cada modo real renderiza <RealAccountEmpty />.
  const portfolio = usePortfolio(mode === "demo" || isRealAccountUiEnabled());
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

  // Las criptos y los LST no viven en `useTickers` (catálogo de acciones): su
  // nombre sale de los catálogos K1/K2 y, si el símbolo no está ahí, se sigue
  // con el mapa de acciones de siempre. Sin esto una posición BTC o JitoSOL
  // se vería con el símbolo crudo.
  const positionName = (symbol: string) =>
    positionMeta(symbol)?.name ?? tickerBySymbol.get(symbol)?.name ?? symbol;

  // Una sola petición de estado para todas las posiciones de la cartera.
  // `useTickers` no reemplaza estos datos: el catálogo no trae `safetyStatus`,
  // `period` ni `halted`, así que usarlo para el aviso inventaría estado.
  const positionSymbols = useMemo(
    () => (portfolio.data?.positions ?? []).map((position) => position.symbol),
    [portfolio.data],
  );
  const { bySymbol: assetStatusBySymbol } = useAssetStatuses(
    positionSymbols,
    mode === "demo" || isRealAccountUiEnabled(),
  );

  const loaded = portfolio.data;
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const pendingFx = currency === "CLP" && !fxKnown && fx.isPending;
  const showFxNote = currency === "CLP" && !fxKnown && !fx.isPending;
  const masked = hidden === true;
  const page = t.pages.portfolio;

  if (isRealAccountUiBlocked(mode)) {
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
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-10 sm:gap-12">
        <span className="sr-only">{t.states.loading}</span>
        <div className="flex flex-col">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-11 w-64 max-w-full sm:h-14" />
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-5 border-t border-border pt-5">
            {["ganancia", "invertido", "disponible"].map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-24 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full rounded-full sm:w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-64 w-full sm:h-72" />
        <div className="flex flex-col gap-4 border-t border-border pt-8">
          {["a", "b", "c", "d"].map((key) => (
            <div key={key} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
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
    // N18: igual que en el detalle, el total sólo se tiñe contra el actual.
    const hoverForce: PriceFlash | undefined =
      hoverUsd !== null ? priceFlashDirection(loaded.totalUsd, hoverUsd, "usd", "usd") : undefined;
    const sliceInputs: { key: string; label: string; valueUsd: number; color: string }[] = [];
    for (const position of loaded.positions) {
      if (!(position.valueUsd > 0)) continue;
      sliceInputs.push({
        key: position.symbol,
        label: positionName(position.symbol),
        valueUsd: position.valueUsd,
        color: POSITION_COLORS[sliceInputs.length % POSITION_COLORS.length] ?? "#059669",
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
    const allocationItems: AllocationItem[] = loaded.positions
      .filter((position) => position.valueUsd > 0)
      .map((position, index) => ({
        symbol: position.symbol,
        name: positionName(position.symbol),
        valueUsd: position.valueUsd,
        pct: loaded.totalUsd > 0 ? position.valueUsd / loaded.totalUsd : 0,
        color: POSITION_COLORS[index % POSITION_COLORS.length] ?? "#059669",
      }));

    const orders = tradeActivity(activity.data ?? []);
    const copy = carteraCopy(language);
    const ui = carteraUi(language);
    const perf = portfolioPerformance(loaded.positions, { pnlUsd: loaded.pnlUsd, pnlPct: loaded.pnlPct });
    const bestName = perf.best ? positionName(perf.best.symbol) : null;
    const worstName = perf.worst ? positionName(perf.worst.symbol) : null;
    const sameRank = perf.best !== null && perf.worst !== null && perf.best.symbol === perf.worst.symbol;
    const hasPositions = loaded.positions.length > 0;
    // Sin USDC el primer paso es depositar; con saldo, explorar el mercado.
    const hasCash = loaded.cashUsdc > 0;

    body = (
      <div
        className="flex flex-col gap-10 sm:gap-12"
        data-total={loaded.totalUsd}
        data-cash={loaded.cashUsdc}
        data-positions={positionSum}
        data-reconciled={sumsMatch(positionSum + loaded.cashUsdc, loaded.totalUsd) ? "1" : "0"}
      >
        {hasPositions ? (
          <>
            <PatrimonyHero
              copy={copy}
              perf={perf}
              shownUsd={shownUsd}
              cashUsdc={loaded.cashUsdc}
              hoverActive={hoverUsd !== null}
              hoverForce={hoverForce}
              currency={currency}
              rate={rate}
              pendingFx={pendingFx}
              masked={masked}
              hiddenLabel={t.shell.balanceHidden}
              onChart={ui.onChart}
              summaryTip={ui.summaryTip}
              freshnessAt={portfolio.dataUpdatedAt || loaded.updatedAt}
            />

            {masked ? null : (
              <ValueChart
                positions={loaded.positions}
                cashUsdc={loaded.cashUsdc}
                totalUsd={loaded.totalUsd}
                onHover={onHoverUsd}
                currency={currency}
                rate={rate}
                pendingFx={pendingFx}
              />
            )}
          </>
        ) : null}

        {showFxNote ? (
          <p className={cn("text-[13px] text-fg-muted", hasPositions && "-mt-4")}>{t.detail.fxFallback}</p>
        ) : null}

        {loaded.positions.length === 0 ? (
          <EmptyState
            title={t.portfolio.emptyTitle}
            description={t.portfolio.emptyBody}
            action={
              /* Paso siguiente: con USDC disponible lo primero es explorar; con
                 la billetera vacía, depositar. El otro paso queda al lado. */
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="min-h-11 w-full whitespace-nowrap sm:w-auto">
                  <Link href={hasCash ? MARKET_HREF : DEPOSIT_HREF}>
                    {hasCash ? t.portfolio.explore : t.trade.deposit}
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="min-h-11 w-full whitespace-nowrap sm:w-auto">
                  <Link href={hasCash ? DEPOSIT_HREF : MARKET_HREF}>
                    {hasCash ? t.trade.deposit : t.portfolio.explore}
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <section className="border-t border-border pt-8">
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="text-xl font-medium tracking-tight">{t.portfolio.positions}</h2>
                  <InfoTip label={`${copy.whatIsThis}. ${copy.avgCost}`} text={ui.positionsTip} />
                </div>

                <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <dt className="label">{copy.best}</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      {perf.best === null || !bestName ? (
                        <span className="text-[13px] text-fg-muted">{copy.emptyFigure}</span>
                      ) : (
                        <>
                          <span className="min-w-0 truncate text-[13px] font-medium text-fg">{bestName}</span>
                          {masked ? (
                            <Masked label={t.shell.balanceHidden} className="shrink-0 text-[13px]" />
                          ) : (
                            <ChangeBadge value={perf.best.pnlPct} size="sm" className="shrink-0" />
                          )}
                        </>
                      )}
                    </dd>
                  </div>

                  {sameRank ? null : (
                    <div className="flex min-w-0 items-baseline gap-2">
                      <dt className="label">{copy.worst}</dt>
                      <dd className="flex min-w-0 items-center gap-2">
                        {perf.worst === null || !worstName ? (
                          <span className="text-[13px] text-fg-muted">{copy.emptyFigure}</span>
                        ) : (
                          <>
                            <span className="min-w-0 truncate text-[13px] font-medium text-fg">{worstName}</span>
                            {masked ? (
                              <Masked label={t.shell.balanceHidden} className="shrink-0 text-[13px]" />
                            ) : (
                              <ChangeBadge value={perf.worst.pnlPct} size="sm" className="shrink-0" />
                            )}
                          </>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="mt-6 hidden items-center gap-4 pb-2 md:flex">
                <div className={cn(POSITION_ROW_GRID, "flex-1")}>
                  <span aria-hidden />
                  <span className="label-xs text-right">{t.detail.shares}</span>
                  <span className="label-xs text-right">
                    {currency === "CLP" ? t.detail.priceClp : t.detail.priceUsd}
                  </span>
                  <span className="label-xs text-right">{t.detail.value}</span>
                  <span className="label-xs text-right">{t.portfolio.pnl}</span>
                </div>
                <span aria-hidden className={cn("shrink-0", POSITION_ACTION_WIDTH)} />
              </div>

              <ul className="mt-6 divide-y divide-border border-t border-border md:mt-0">
                {loaded.positions.map((position) => {
                  const ticker = tickerBySymbol.get(position.symbol);
                  const name = positionName(position.symbol);
                  const value = moneyView(position.valueUsd, currency, rate);
                  const pnlValue = position.pnlUsd === null ? null : moneyView(position.pnlUsd, currency, rate);
                  const priceValue = Number.isFinite(position.priceUsd)
                    ? moneyView(position.priceUsd, currency, rate)
                    : null;
                  return (
                    <li key={position.symbol}>
                      <PositionRow
                        href={tickerHref(position.symbol)}
                        symbol={position.symbol}
                        name={name}
                        logoUrl={ticker?.logo || logoPathFromSymbol(position.symbol)}
                        shares={position.shares}
                        shareHint={t.portfolio.shareHint}
                        price={priceValue === null ? null : priceValue.amount}
                        value={value.amount}
                        currency={value.currency}
                        pnl={pnlValue === null ? null : pnlValue.amount}
                        pnlPct={position.pnlPct}
                        weightPct={loaded.totalUsd > 0 ? position.valueUsd / loaded.totalUsd : null}
                        hidden={masked}
                        hiddenLabel={t.shell.balanceHidden}
                        pending={pendingFx}
                        action={
                          position.shares > 0 ? (
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="w-full whitespace-nowrap px-0 text-fg hover:bg-surface-2"
                            >
                              <Link
                                href={sellHref(position.symbol)}
                                aria-label={fill(t.detail.tradeSell, { name })}
                              >
                                {t.detail.sell}
                              </Link>
                            </Button>
                          ) : null
                        }
                      />
                      {position.avgCostUsd !== null && Number.isFinite(position.avgCostUsd) ? (
                        <p className="flex min-w-0 items-baseline gap-1.5 pb-3 pl-12 text-[12px] leading-4 text-fg-subtle tabular-nums sm:pl-[3.25rem]">
                          <span className="shrink-0">{copy.avgCost}</span>
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
                      <PositionSafetyNote
                        status={assetStatusBySymbol.get(position.symbol.toLowerCase())}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            {slices.length > 0 ? (
              <section className="border-t border-border pt-8">
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="text-xl font-medium tracking-tight">{t.portfolio.allocation}</h2>
                    <p className="mt-1 text-[13px] text-fg-muted">{t.portfolio.allocationLabel}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-8 md:grid-cols-[200px_minmax(0,1fr)] md:items-center md:gap-12">
                  <div className="hidden md:block">
                    <PortfolioDonut slices={slices} />
                  </div>
                  <AllocationBar
                    label={t.portfolio.allocationLabel}
                    slices={slices}
                    items={allocationItems}
                    cashUsd={loaded.cashUsdc}
                    totalUsd={loaded.totalUsd}
                    formatValue={(usd) => {
                      if (masked) return "••••";
                      if (pendingFx) return "…";
                      const view = moneyView(usd, currency, rate);
                      return formatMoney(view.amount, view.currency);
                    }}
                    lang={language}
                  />
                </div>
              </section>
            ) : null}

            <PortfolioHealthCard
              positions={loaded.positions}
              cashUsdc={loaded.cashUsdc}
              totalUsd={loaded.totalUsd}
              masked={masked}
            />
            <DividendMultiplierCard
              positions={loaded.positions}
              currency={currency}
              rate={rate}
              masked={masked}
            />
            <PortfolioTaxSummaryCard
              positions={loaded.positions}
              activities={activity.data ?? []}
              currency={currency}
              rate={rate}
              masked={masked}
            />
          </>
        )}

        <section className="border-t border-border pt-8">
          <h2 className="text-xl font-medium tracking-tight">{t.portfolio.history}</h2>
          <div className="mt-2">
            {activity.isPending ? (
              <div role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">{t.states.loading}</span>
                <Skeleton className="h-16 w-full rounded-xl" />
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
              <p className="py-6 text-sm text-fg-muted">{t.portfolio.historyEmpty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {orders.map((row) => {
                  const name = positionMeta(row.symbol)?.name ?? tickerBySymbol.get(row.symbol)?.name ?? row.symbol;
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
                      <div className="flex justify-end pb-3">
                        <TradeReceiptTrigger
                          id={row.id}
                          kind={row.kind === "sell" ? "sell" : "buy"}
                          symbol={row.symbol}
                          tickerName={name}
                          shares={row.amountUi}
                          usd={row.valueUsd ?? 0}
                          at={row.at}
                          status={receiptStatusOf(row.status)}
                          signature={row.signature ?? undefined}
                          currency={currency}
                          rate={rate}
                          masked={masked}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <InvestmentHistory
          items={activity.data ?? []}
          loading={activity.isPending}
          lang={language}
          formatUsdValue={(usd) => formatMoney(usd, "USD")}
          formatClpValue={(clp) => formatMoney(clp, "CLP")}
          displayCurrency={currency}
          fxRate={rate}
          masked={masked}
          tickersBySymbol={tickerBySymbol}
        />

        {mode === "demo" ? (
          <div className="flex flex-col gap-2 border-t border-border pt-6">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={page.title} description={page.lead} />
      {body}
    </div>
  );
}
