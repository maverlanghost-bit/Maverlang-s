"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ActivityItem } from "@/components/domain/activity-item";
import { PriceText } from "@/components/domain/price-text";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth";
import { formatDateTime, formatMoney, type MoneyCurrency } from "@/lib/format";
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
      <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={40} decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{symbol}</span>
        <span className="mt-0.5 block truncate text-sm text-fg-muted">{name}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        {hidden && (symbol === "USDC" || symbol === "SOL") ? (
          <Masked label={hiddenLabel} />
        ) : (
          <span className="num text-sm text-fg">{amount}</span>
        )}
        {hidden ? null : pending ? (
          <Skeleton className="h-5 w-16" />
        ) : symbol === "USDC" && currency === "USD" ? null : (
          <PriceText value={value} currency={currency} size="sm" />
        )}
      </span>
    </>
  );
  const className = "flex min-h-16 items-center gap-3 rounded-xl px-2 py-3";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={`${className} transition duration-[140ms] hover:bg-surface-2`}>
      {body}
    </Link>
  );
}

export function WalletScreen() {
  const { t, currency } = useT();
  const session = useSession();
  const { hidden } = useHideBalance();
  const balances = useBalances();
  const activity = useActivity();
  const tickers = useTickers();
  const fx = useFx();

  if (session.status === "loading" || balances.isPending) {
    return <LoadingState label={t.states.loading} />;
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
  const address = session.user?.walletAddress?.trim() ?? "";
  const tickerBySymbol = new Map((tickers.data ?? []).map((ticker) => [ticker.symbol, ticker]));
  const rate = fx.data?.rate;
  const pendingFx = currency === "CLP" && fx.isPending;
  const clp = currency === "CLP" ? displayPrice(usdcUi, "CLP", rate) : null;
  const masked = hidden === true;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.pages.wallet.title} description={t.wallet.lead} />

      <Card>
        <p className="label">{t.wallet.usdcLabel}</p>
        <div className="mt-2">
          {masked ? (
            <Masked label={t.shell.balanceHidden} className="text-4xl sm:text-5xl" />
          ) : (
            <PriceText value={usdcUi} currency="USD" size="lg" />
          )}
        </div>
        {masked ? null : pendingFx ? (
          <Skeleton className="mt-2 h-5 w-28" />
        ) : clp !== null ? (
          <p className="num mt-2 text-sm text-fg-muted">{fill(t.wallet.clpApprox, { amount: formatMoney(clp, "CLP") })}</p>
        ) : null}
        <p className="mt-1 text-sm text-fg-muted">{t.wallet.usdcHint}</p>

        <div className="mt-6 border-t border-border pt-4">
          <p className="label">{t.wallet.solLabel}</p>
          <p className="mt-2 text-lg text-fg">{masked ? <Masked label={t.shell.balanceHidden} /> : <span className="num">{formatSol(solUi)}</span>}</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-muted">{t.wallet.solExplain}</p>
          {lowSol ? (
            <p role="status" className="mt-3 rounded-xl bg-warn-bg px-4 py-3 text-sm leading-relaxed text-fg">
              {t.wallet.solLow}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
      </Card>

      <Card>
        <h2 className="text-lg">{t.wallet.assets}</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{t.wallet.assetsEmpty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
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

      <Card>
        <h2 className="text-lg">{t.wallet.address}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t.wallet.addressHint}</p>
        {address ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="num min-w-0 flex-1 break-all text-sm text-fg">{address}</p>
            <CopyButton value={address} label={t.wallet.copy} copiedLabel={t.wallet.copied} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">{t.wallet.noWallet}</p>
        )}
      </Card>

      <Card>
        <h2 id="actividad" className="text-lg scroll-mt-24">
          {t.wallet.activity}
        </h2>
        <ActivityList
          pending={activity.isPending}
          error={activity.isError}
          rows={activity.data ?? []}
          hidden={masked}
          onRetry={() => {
            void activity.refetch();
          }}
        />
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
      logoUrl={ticker?.logo}
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
  onRetry,
}: {
  pending: boolean;
  error: boolean;
  rows: Activity[];
  hidden: boolean;
  onRetry: () => void;
}) {
  const { t } = useT();
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
  if (rows.length === 0) return <p className="mt-3 text-sm text-fg-muted">{t.wallet.activityEmpty}</p>;

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
          <ul className="divide-y divide-border">
            {group.rows.map((row) => (
              <li key={row.id}>
                <ActivityItem
                  title={activityTitle(t.wallet.kinds, row)}
                  detail={activityDetail(row, hidden, t.shell.balanceHidden)}
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

function activityDetail(row: Activity, hidden: boolean, hiddenLabel: string): ReactNode {
  const amount = formatAssetAmount(row.symbol, row.amountUi);
  if (row.symbol === "USDC" || row.symbol === "SOL") {
    return hidden ? <Masked label={hiddenLabel} /> : amount;
  }
  const money = row.valueUsd !== null ? formatMoney(row.valueUsd, "USD") : null;
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
