"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ActivityItem } from "@/components/domain/activity-item";
import { CsvExportButton } from "@/components/domain/csv-export-button";
import { DemoAddressNotice } from "@/components/domain/demo-address-notice";
import { PriceText } from "@/components/domain/price-text";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { WalletVaultHeader } from "@/components/domain/wallet-vault-header";
import type { BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { isRealAccountUiBlocked } from "@/lib/account/real-ui-gate";
import { useSession } from "@/lib/auth";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, type MoneyCurrency } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useActivity, useBalances, useFx, useTickers } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import type { Activity, ActivityKind, Balance, Currency, OrderStatus, Ticker } from "@/lib/types";
import { groupBySantiagoDay } from "@/lib/wallet/days";
import { formatAssetAmount } from "@/lib/wallet/display";
import { explorerTxUrl } from "@/lib/wallet/explorer";
import { formatSol, solIsLow } from "@/lib/wallet/send-cost";

const DEPOSIT_HREF = "/app/billetera/depositar";
const SEND_HREF = "/app/billetera/enviar";
const RECEIVE_HREF = "/app/billetera/recibir";
const MARKET_HREF = "/app";

/**
 * Estados vacíos de la billetera (§1.9): el texto vive en el componente, no en
 * content/i18n. Cada estado deja un paso siguiente concreto: depositar USDC o
 * explorar acciones.
 */
type EmptyCopy = {
  assetsTitle: string;
  historyTitle: string;
  filteredTitle: string;
  filteredBody: string;
  showAll: string;
  depositUsdc: string;
  exploreStocks: string;
  zeroBalance: string;
};

const EMPTY_COPY: Record<"es-CL" | "en", EmptyCopy> = {
  "es-CL": {
    assetsTitle: "Tu billetera está vacía",
    historyTitle: "Tu historial está vacío",
    filteredTitle: "Sin movimientos en este filtro",
    filteredBody: "Cambia el filtro para ver el resto de tu historial.",
    showAll: "Ver todas",
    depositUsdc: "Depositar USDC",
    exploreStocks: "Explorar acciones",
    zeroBalance: "Sin saldo todavía",
  },
  en: {
    assetsTitle: "Your wallet is empty",
    historyTitle: "Your history is empty",
    filteredTitle: "No activity with this filter",
    filteredBody: "Change the filter to see the rest of your history.",
    showAll: "Show all",
    depositUsdc: "Deposit USDC",
    exploreStocks: "Explore stocks",
    zeroBalance: "No balance yet",
  },
};

type ActivityFilter = "all" | "investments" | "cash";

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "investments", label: "Inversiones" },
  { id: "cash", label: "Depósitos y retiros" },
];

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: "warn",
  submitted: "warn",
  confirmed: "up",
  failed: "down",
  expired: "neutral",
};

function rank(symbol: string) {
  if (symbol === "USDC") return 0;
  if (symbol === "SOL") return 1;
  return 2;
}

function moneyView(usd: number, currency: Currency, rate: number | undefined): { amount: number; currency: MoneyCurrency } {
  if (currency === "CLP") {
    const converted = displayPrice(usd, "CLP", rate);
    if (converted !== null) return { amount: converted, currency: "CLP" };
  }
  return { amount: usd, currency: "USD" };
}

function formatDay(iso: string, unknown: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return unknown;
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(time);
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

/** Ilustración del estado vacío de la billetera (decorativa, mismo trazo del design system). */
function WalletEmptyArt() {
  return (
    <svg viewBox="0 0 80 64" className="size-16 text-fg-muted" fill="none" aria-hidden>
      <rect x="12.5" y="16.5" width="55" height="34" rx="8" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M44 28.5h13a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H44a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="47" cy="33.5" r="1.6" className="fill-brand" />
    </svg>
  );
}

function AssetRow({
  href,
  symbol,
  name,
  logoUrl,
  amount,
  value,
  currency,
  hidden,
  hiddenLabel,
  pending,
}: {
  href: string | null;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  amount: string;
  value: number;
  currency: MoneyCurrency;
  hidden: boolean;
  hiddenLabel: string;
  pending: boolean;
}) {
  const body = (
    <>
      <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative loading="lazy" sizes="40px" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{symbol}</span>
        <span className="mt-0.5 block truncate text-sm text-fg-muted">{name}</span>
      </span>
      <span className="flex min-w-0 max-w-full shrink-0 flex-col items-end gap-1 text-right">
        {hidden && (symbol === "USDC" || symbol === "SOL") ? (
          <Masked label={hiddenLabel} />
        ) : (
          <span className="num max-w-full text-sm break-words text-fg tabular-nums">{amount}</span>
        )}
        {hidden ? null : pending ? (
          <Skeleton className="h-5 w-16" />
        ) : symbol === "USDC" && currency === "USD" ? null : (
          <PriceText value={value} currency={currency} size="sm" />
        )}
      </span>
    </>
  );
  const className =
    "flex min-h-16 items-center gap-3 rounded-2xl px-2 py-3 transition-colors duration-150 hover:bg-surface-1/80 active:bg-surface-2/60";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export function WalletScreen() {
  const { t, language, currency } = useT();
  const copy = EMPTY_COPY[language];
  const session = useSession();
  const { mode } = useAccountMode();
  const { hidden } = useHideBalance();
  const balances = useBalances();
  const activity = useActivity();
  const tickers = useTickers();
  const fx = useFx();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activityQuery, setActivityQuery] = useState("");

  if (session.status === "loading" || balances.isPending) {
    return <LoadingState label={t.states.loading} />;
  }

  if (isRealAccountUiBlocked(mode)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.pages.wallet.title} description={t.wallet.lead} />
        <RealAccountEmpty />
      </div>
    );
  }

  if (balances.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.pages.wallet.title} description={t.wallet.lead} />
        <ErrorState
          title={t.wallet.loadError}
          label={t.states.error}
          retryLabel={t.states.retry}
          onRetry={() => {
            void balances.refetch();
          }}
        />
      </div>
    );
  }

  const rows = [...(balances.data ?? [])].sort((left, right) => rank(left.symbol) - rank(right.symbol));
  const usdc = rows.find((row) => row.symbol === "USDC");
  const sol = rows.find((row) => row.symbol === "SOL");
  const usdcUi = usdc?.uiAmount ?? 0;
  const solUi = sol?.uiAmount ?? 0;
  const lowSol = solIsLow(solUi);
  const tickerBySymbol = new Map((tickers.data ?? []).map((ticker) => [ticker.symbol, ticker]));
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const pendingFx = currency === "CLP" && !fxKnown && fx.isPending;
  const usdcView = moneyView(usdcUi, currency, fxKnown ? rate : undefined);
  const masked = hidden === true;
  const hasPositions = rows.some((row) => row.symbol !== "USDC" && row.symbol !== "SOL" && row.uiAmount > 0);
  /** Sin USDC y sin posiciones: el saldo está en cero y conviene ofrecer el depósito. */
  const showZeroBalance = !masked && rows.length > 0 && usdcUi <= 0 && !hasPositions;

  const allActivities = activity.data ?? [];
  const byFilter =
    activityFilter === "all"
      ? allActivities
      : activityFilter === "investments"
        ? allActivities.filter((row) => row.kind === "buy" || row.kind === "sell")
        : allActivities.filter((row) => row.kind !== "buy" && row.kind !== "sell");
  const activityTerm = activityQuery.trim().toLowerCase();
  const filteredActivities =
    activityTerm.length === 0
      ? byFilter
      : byFilter.filter(
          (row) =>
            row.symbol.toLowerCase().includes(activityTerm) ||
            row.kind.toLowerCase().includes(activityTerm) ||
            (row.signature ?? "").toLowerCase().includes(activityTerm),
        );
  const buyCount = allActivities.filter((row) => row.kind === "buy").length;
  const sellCount = allActivities.length - buyCount;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.pages.wallet.title} description={t.wallet.lead} />

      <Card>
        <WalletVaultHeader solUi={solUi} lowSol={lowSol} mode={mode} />
        <p className="label">{t.wallet.usdcLabel}</p>
        <div className="mt-2 min-w-0 max-w-full" aria-live="polite">
          {masked ? (
            <Masked label={t.shell.balanceHidden} className="block text-[1.75rem] leading-none tracking-tight sm:text-[2rem]" />
          ) : pendingFx ? (
            <Skeleton className="h-8 w-44" />
          ) : (
            <PriceText
              value={usdcView.amount}
              currency={usdcView.currency}
              size="lg"
              className="max-w-full break-words text-[1.75rem] leading-none font-medium tracking-tight tabular-nums sm:text-[2rem]"
            />
          )}
          {masked || pendingFx ? null : currency === "CLP" && !fxKnown ? (
            <p className="mt-2 text-sm text-fg-muted">{t.detail.fxMissing}</p>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-fg-muted">{t.wallet.usdcHint}</p>
        {showZeroBalance ? (
          <p role="status" className="mt-2 text-sm text-fg-muted">
            {copy.zeroBalance}
            {" · "}
            <Link
              href={DEPOSIT_HREF}
              className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              {copy.depositUsdc}
            </Link>
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:grid sm:grid-cols-3">
          <Button asChild size="lg" className="w-full">
            <Link href={DEPOSIT_HREF}>{t.wallet.deposit}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href={SEND_HREF}>{t.wallet.send}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href={RECEIVE_HREF}>{t.wallet.receive}</Link>
          </Button>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <p className="label">{t.wallet.solLabel}</p>
          {sol ? (
            <>
              <p className="mt-2 max-w-full text-lg break-words text-fg">{masked ? <Masked label={t.shell.balanceHidden} /> : <span className="num font-medium tabular-nums">{formatSol(solUi)}</span>}</p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-muted">{t.wallet.solExplain}</p>
              {lowSol ? (
                <p role="status" className="mt-3 rounded-xl bg-warn-bg px-4 py-3 text-sm leading-relaxed text-fg">
                  {t.wallet.solLow}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-muted">{t.wallet.solExplain}</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold tracking-tight">{t.wallet.assets}</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              media={<WalletEmptyArt />}
              title={copy.assetsTitle}
              description={t.wallet.assetsEmpty}
              action={
                <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">
                  <Button asChild size="lg" className="min-h-11 w-full whitespace-nowrap sm:w-auto">
                    <Link href={DEPOSIT_HREF}>{copy.depositUsdc}</Link>
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    size="lg"
                    className="min-h-11 w-full whitespace-nowrap sm:w-auto"
                  >
                    <Link href={MARKET_HREF}>{copy.exploreStocks}</Link>
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <ul className="mt-2 min-w-0 divide-y divide-border">
            {rows.map((row) => (
              <li key={row.mint}>
                <AssetLine
                  row={row}
                  ticker={tickerBySymbol.get(row.symbol)}
                  currency={currency}
                  rate={rate}
                  pendingFx={pendingFx}
                  hidden={masked}
                  hiddenLabel={t.shell.balanceHidden}
                  usdcName={t.wallet.usdcName}
                  solName={t.wallet.solName}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Protección demo: sin dirección ni copia para evitar envíos de fondos reales. */}
      {mode === "demo" ? <DemoAddressNotice /> : null}

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="actividad" className="text-lg font-semibold tracking-tight scroll-mt-24">
            {t.wallet.activity}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <div role="group" aria-label="Filtrar actividad" className="flex max-w-full flex-wrap items-center gap-1.5">
              {ACTIVITY_FILTERS.map((filter) => {
                const active = activityFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActivityFilter(filter.id)}
                    className={cn(
                      "min-h-11 shrink-0 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition duration-150 sm:min-h-9",
                      active
                        ? "border-fg/20 bg-fg text-bg shadow-[0_1px_2px_rgba(12,15,20,0.08)]"
                        : "border-control bg-bg text-fg-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            {filteredActivities.length > 0 ? (
              <CsvExportButton rows={filteredActivities} currency={currency} fxRate={fxKnown ? rate : undefined} />
            ) : null}
          </div>
        </div>
        {allActivities.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-border bg-surface-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-fg">
                <span className="size-1.5 rounded-full bg-fg-muted" aria-hidden="true" />
                <span className="num">{allActivities.length}</span>
                <span className="text-fg-muted">movimientos</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-fg">
                <span className="size-1.5 rounded-full bg-up" aria-hidden="true" />
                <span className="num">{buyCount}</span>
                <span className="text-fg-muted">compras</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-fg">
                <span className="size-1.5 rounded-full bg-down" aria-hidden="true" />
                <span className="num">{sellCount}</span>
                <span className="text-fg-muted">ventas y retiros</span>
              </span>
              {activityTerm.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-semibold text-fg">
                  <span className="num">{filteredActivities.length}</span>
                  <span>{filteredActivities.length === 1 ? "resultado" : "resultados"}</span>
                </span>
              ) : null}
            </div>
            <input
              type="search"
              value={activityQuery}
              onChange={(e) => setActivityQuery(e.target.value)}
              placeholder="Buscar por símbolo (ej. NVDAx, USDC) o hash..."
              aria-label="Buscar en actividad"
              className="h-11 w-full rounded-xl border border-control bg-bg px-3 text-base text-fg placeholder:text-fg-muted outline-none focus:border-fg sm:h-9 sm:w-64 sm:text-[13px]"
            />
          </div>
        ) : null}
        {activityTerm.length > 0 && filteredActivities.length === 0 ? (
          <p role="status" className="mt-3 rounded-2xl border border-border bg-surface-1 px-4 py-3 text-sm leading-relaxed text-fg-muted">
            Sin resultados para «{activityQuery.trim()}». Revisa el símbolo o el hash de la transacción, o limpia el buscador para ver todo el historial.
          </p>
        ) : (
          <ActivityList
            pending={activity.isPending}
            error={activity.isError}
            rows={filteredActivities}
            hidden={masked}
            currency={currency}
            rate={fxKnown ? rate : undefined}
            hasActivity={allActivities.length > 0}
            onRetry={() => {
              void activity.refetch();
            }}
            onShowAll={() => setActivityFilter("all")}
          />
        )}
      </Card>
    </div>
  );
}

function AssetLine({
  row,
  ticker,
  currency,
  rate,
  pendingFx,
  hidden,
  hiddenLabel,
  usdcName,
  solName,
}: {
  row: Balance;
  ticker: Ticker | undefined;
  currency: Currency;
  rate: number | undefined;
  pendingFx: boolean;
  hidden: boolean;
  hiddenLabel: string;
  usdcName: string;
  solName: string;
}) {
  const name = row.symbol === "USDC" ? usdcName : row.symbol === "SOL" ? solName : (ticker?.name ?? row.symbol);
  const href = ticker?.enabled ? `/app/accion/${encodeURIComponent(row.symbol)}` : null;
  const value = moneyView(row.valueUsd, currency, rate);
  return (
    <AssetRow
      href={href}
      symbol={row.symbol}
      name={name}
      logoUrl={ticker?.logo || logoPathFromSymbol(row.symbol)}
      amount={formatAssetAmount(row.symbol, row.uiAmount)}
      value={value.amount}
      currency={value.currency}
      hidden={hidden}
      hiddenLabel={hiddenLabel}
      pending={currency === "CLP" && pendingFx}
    />
  );
}

function ActivityList({
  pending,
  error,
  rows,
  hidden,
  currency,
  rate,
  hasActivity,
  onRetry,
  onShowAll,
}: {
  pending: boolean;
  error: boolean;
  rows: Activity[];
  hidden: boolean;
  currency: Currency;
  rate: number | undefined;
  hasActivity: boolean;
  onRetry: () => void;
  onShowAll: () => void;
}) {
  const { t, language } = useT();
  const copy = EMPTY_COPY[language];
  const [now] = useState(() => Date.now());
  if (pending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="mt-2">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-4">
        <ErrorState title={t.wallet.activityError} label={t.states.error} retryLabel={t.states.retry} onRetry={onRetry} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="mt-4">
        {hasActivity ? (
          <EmptyState
            title={copy.filteredTitle}
            description={copy.filteredBody}
            action={
              <Button variant="secondary" size="lg" className="min-h-11" onClick={onShowAll}>
                {copy.showAll}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={copy.historyTitle}
            description={t.wallet.activityEmpty}
            action={
              <Button asChild size="lg" className="min-h-11 w-full whitespace-nowrap sm:w-auto">
                <Link href={MARKET_HREF}>{copy.exploreStocks}</Link>
              </Button>
            }
          />
        )}
      </div>
    );
  }

  const groups = groupBySantiagoDay(rows, now, { today: t.wallet.today, yesterday: t.wallet.yesterday }, (iso) =>
    formatDay(iso, t.wallet.unknownDay),
  );

  return (
    <div className="mt-2 flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`day-${group.key}`}>
          <h3 id={`day-${group.key}`} className="label">
            {group.label}
          </h3>
          <ul className="min-w-0 divide-y divide-border">
            {group.rows.map((row) => (
              <li key={row.id}>
                <ActivityItem
                  title={activityTitle(t.wallet.kinds, row)}
                  detail={activityDetail(row, hidden, t.shell.balanceHidden, currency, rate)}
                  time={formatDateTime(row.at)}
                  dateTime={row.at}
                  status={t.portfolio.status[row.status]}
                  tone={STATUS_TONE[row.status]}
                  explorerHref={row.signature ? explorerTxUrl(row.signature) : null}
                  explorerLabel={t.trade.explorer}
                  explorerNew={t.trade.explorerNew}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function activityTitle(kinds: Record<ActivityKind, string>, row: Activity) {
  return `${kinds[row.kind]} · ${row.symbol}`;
}

function activityDetail(
  row: Activity,
  hidden: boolean,
  hiddenLabel: string,
  currency: Currency,
  rate: number | undefined,
): ReactNode {
  const amount = formatAssetAmount(row.symbol, row.amountUi);
  if (row.symbol === "USDC" || row.symbol === "SOL") {
    return hidden ? <Masked label={hiddenLabel} /> : amount;
  }
  if (row.valueUsd === null) return amount;
  const view = moneyView(row.valueUsd, currency, rate);
  const money = formatMoney(view.amount, view.currency);
  if (!money) return amount;
  if (hidden) {
    return (
      <>
        {amount}
        {" · "}
        <Masked label={hiddenLabel} />
      </>
    );
  }
  return `${amount} · ${money}`;
}
