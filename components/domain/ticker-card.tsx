import type { ReactNode } from "react";
import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { cn } from "@/lib/cn";
import type { MoneyCurrency } from "@/lib/format";

export function TickerCard({
  href,
  symbol,
  name,
  logoUrl,
  price,
  currency = "USD",
  change,
  action,
  className,
  lowLiquidityLabel = null,
}: {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  price: number;
  currency?: MoneyCurrency;
  change: number;
  action?: ReactNode;
  className?: string;
  /** Etiqueta discreta de baja liquidez (M38). Null la oculta. */
  lowLiquidityLabel?: string | null;
}) {
  return (
    <div className={cn("relative w-64 shrink-0 snap-start sm:w-60", className)}>
      <Link
        href={href}
        className="flex h-full min-h-32 flex-col gap-3 rounded-3xl border border-border bg-surface-1 p-4 pr-14 transition duration-[140ms] hover:bg-surface-2"
      >
        <span className="flex items-center gap-2">
          <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{symbol}</span>
            <span className="block truncate text-sm text-fg-muted">
              {name}
              {lowLiquidityLabel ? <span> · {lowLiquidityLabel}</span> : null}
            </span>
          </span>
        </span>
        <span className="flex flex-col items-start gap-1.5">
          <ChangeBadge value={change} className="px-3 py-1 text-base font-semibold" />
          <FlashPrice value={price} currency={currency} size="sm" />
        </span>
      </Link>
      {action ? <div className="absolute top-1 right-1">{action}</div> : null}
    </div>
  );
}
