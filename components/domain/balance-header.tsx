"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth/session-context";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useFx, usePortfolio } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Currency } from "@/lib/types";

const HIDE_EVENT = "a24-hide-balance";

function hideKey(userId: string) {
  return `a24_hide_balance:${userId}`;
}

function subscribeHide(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith("a24_hide_balance")) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HIDE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HIDE_EVENT, onChange);
  };
}

function readHidden(key: string | null): boolean | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function hiddenOnServer(): boolean | null {
  return null;
}

function useHideBalance(userId: string | null) {
  const key = userId ? hideKey(userId) : null;
  const hidden = useSyncExternalStore(subscribeHide, () => readHidden(key), hiddenOnServer);
  const toggle = useCallback(() => {
    if (!key) return;
    const next = readHidden(key) !== true;
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      return;
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
  }, [key]);
  return { hidden, toggle };
}

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
  const session = useSession();
  const userId = session.status === "authenticated" ? (session.user?.id ?? null) : null;
  const { hidden, toggle } = useHideBalance(userId);
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
