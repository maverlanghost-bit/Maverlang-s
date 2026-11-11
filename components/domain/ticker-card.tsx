import type { ReactNode } from "react";
import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { Sparkline } from "@/components/domain/sparkline";
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
  sparkline,
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
  /** Serie para la curva. Con menos de 2 puntos no se dibuja. */
  sparkline?: number[];
  action?: ReactNode;
  className?: string;
  /** Etiqueta discreta de baja liquidez (M38). Null la oculta. */
  lowLiquidityLabel?: string | null;
}) {
  return (
    <div className={cn("relative min-w-[220px] flex-1 basis-60 shrink-0 snap-start", className)}>
      <Link
        href={href}
        className="group flex h-full min-h-32 flex-col justify-between gap-3 rounded-2xl bg-surface-1 p-4 pr-12 shadow-card transition-colors duration-200 ease-spring hover:bg-surface-2 active:bg-surface-3/60"
      >
        <span className="flex items-center gap-2">
          <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative loading="eager" sizes="40px" />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[13px] font-semibold tracking-tight text-fg" title={symbol}>
              {symbol}
            </span>
            <span className="line-clamp-2 text-sm leading-tight text-fg-muted" title={name}>
              {name}
              {lowLiquidityLabel ? <span> · {lowLiquidityLabel}</span> : null}
            </span>
          </span>
        </span>
        <span className="mt-auto flex items-end justify-between gap-2">
          <span className="flex min-w-0 flex-col items-start gap-1.5">
            <ChangeBadge value={change} className="px-3 py-1 text-base font-semibold" />
            <span className="flex items-baseline gap-1 font-medium">
              <FlashPrice value={price} currency={currency} size="sm" className="-mr-1" />
              {currency === "CLP" ? (
                <span className="text-[11px] leading-none font-medium text-fg-muted">CLP</span>
              ) : null}
            </span>
          </span>
          {sparkline && sparkline.length >= 2 ? (
            <Sparkline data={sparkline} width={88} height={32} className="shrink-0" />
          ) : null}
        </span>
      </Link>
      {action ? <div className="absolute top-1 right-1">{action}</div> : null}
    </div>
  );
}
