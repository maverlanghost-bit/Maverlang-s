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
        <span className="num text-[15px] font-semibold tabular-nums tracking-[0.2em] text-fg" aria-hidden>
          ••••••
        </span>
        <span className="sr-only">{t.shell.balanceHidden}</span>
      </>
    );
  } else if (amount !== null) {
    value = (
      <>
        <PriceText
          value={amount}
          currency={shownCurrency}
          size="sm"
          className="block truncate text-[15px] font-semibold tabular-nums tracking-tight text-fg"
        />
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

  if (variant === "bar") {
    return (
      <div className={cn("flex min-w-0 items-center gap-1 rounded-xl px-1 tabular-nums tracking-tight", className)}>
        <div className="min-w-0 flex-1">
          <p className="sr-only">{t.shell.balance}</p>
          <div aria-live="polite">{value}</div>
        </div>
        <IconButton
          label={hidden === true ? t.shell.showBalance : t.shell.hideBalance}
          size="sm"
          className="size-9"
          aria-pressed={hidden === true}
          disabled={hidden === null || !userId}
          onClick={toggle}
        >
          {hidden === true ? <IconEyeOff /> : <IconEye />}
        </IconButton>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/75 bg-white/80 px-3 py-2.5 shadow-[0_4px_14px_-6px_rgba(12,15,20,0.06)] backdrop-blur-md tabular-nums tracking-tight",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wider text-fg-muted uppercase">{t.shell.balance}</p>
        <IconButton
          label={hidden === true ? t.shell.showBalance : t.shell.hideBalance}
          size="sm"
          className="-mr-1 size-7 text-fg-muted hover:text-fg"
          aria-pressed={hidden === true}
          disabled={hidden === null || !userId}
          onClick={toggle}
        >
          {hidden === true ? <IconEyeOff /> : <IconEye />}
        </IconButton>
      </div>
      <div className="mt-1 text-[15px] font-semibold tracking-tight text-fg" aria-live="polite">
        {value}
      </div>
    </div>
  );
}
