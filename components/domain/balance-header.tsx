"use client";

import type { ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
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
  const amount = totalUsd === undefined ? null : amountFor(totalUsd, currency, fx.data?.rate);

  let value: ReactNode;
  if (hidden === true) {
    value = (
      <>
        <span className="num text-sm tracking-[0.2em] text-fg" aria-hidden>
          ••••••
        </span>
        <span className="sr-only">{t.shell.balanceHidden}</span>
      </>
    );
  } else if (amount !== null) {
    value = <span className="num block truncate text-sm text-fg">{formatMoney(amount, currency)}</span>;
  } else if (portfolio.isError || (currency === "CLP" && fx.isError)) {
    value = <span className="text-sm text-fg-muted">{t.shell.balanceUnavailable}</span>;
  } else {
    value = <Skeleton className="h-5 w-24" />;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
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
