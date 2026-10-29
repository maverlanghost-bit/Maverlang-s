"use client";

import type { ReactNode } from "react";

import { PriceText } from "@/components/domain/price-text";
import { IconButton } from "@/components/ui/icon-button";
import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useFx, usePortfolio } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Currency } from "@/lib/types";

function amountFor(totalUsd: number, currency: Currency, rate: number | undefined): number | null {
  const value = currency === "USD" ? totalUsd : rate === undefined ? null : totalUsd * rate;
  return value !== null && Number.isFinite(value) ? value : null;
}

export function BalanceHeader({
  variant = "sidebar",
  className,
}: {
  variant?: "bar" | "sidebar";
  className?: string;
}) {
  const { t, currency } = useT();
  const { hidden, toggle, userId } = useHideBalance();
  const portfolio = usePortfolio();
  const fx = useFx();
  const totalUsd = portfolio.data?.totalUsd;
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const waitingFx = currency === "CLP" && !fxKnown && fx.isPending;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const amount =
    totalUsd === undefined || waitingFx ? null : amountFor(totalUsd, shownCurrency, fxKnown ? rate : undefined);

  let value: ReactNode;
  if (hidden === true) {
    value = (
      <>
        <span className="num text-sm tabular-nums tracking-[0.2em] text-fg" aria-hidden>
          ••••••
        </span>
        <span className="sr-only">{t.shell.balanceHidden}</span>
      </>
    );
  } else if (amount !== null) {
    value = (
      <>
        <PriceText value={amount} currency={shownCurrency} size="sm" className="block truncate font-medium tabular-nums tracking-tight" />
        {currency === "CLP" && shownCurrency === "USD" ? (
          <p className="text-xs text-fg-muted">{t.detail.fxMissing}</p>
        ) : null}
      </>
    );
  } else if (portfolio.isError) {
    value = <span className="text-sm text-fg-muted">{t.shell.balanceUnavailable}</span>;
  } else {
    value = <Skeleton className="h-5 w-28" />;
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-2xl border border-border/80 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(5,150,105,0.07),transparent_65%)] shadow-[0_12px_36px_-16px_rgba(12,15,20,0.08)] tabular-nums tracking-tight",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={variant === "bar" ? "sr-only" : "label"}>{t.shell.balance}</p>
        <div className={variant === "sidebar" ? "mt-0.5" : undefined} aria-live="polite">
          {value}
        </div>
      </div>
      <IconButton
        label={hidden === true ? t.shell.showBalance : t.shell.hideBalance}
        size="sm"
        className="size-11"
        aria-pressed={hidden === true}
        disabled={hidden === null || !userId}
        onClick={toggle}
      >
        {hidden === true ? <IconEyeOff /> : <IconEye />}
      </IconButton>
    </div>
  );
}
