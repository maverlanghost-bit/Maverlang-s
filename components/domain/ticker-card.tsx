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
        className="group relative flex h-full min-h-32 min-w-[220px] flex-1 basis-60 snap-start flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-white/90 p-4 pr-12 shadow-[0_8px_24px_-14px_rgba(12,15,20,0.08)] transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:shadow-[0_14px_32px_-12px_rgba(12,15,20,0.12)] active:bg-surface-2/60"
      >
        <span className="flex items-center gap-2">
          <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative loading="eager" sizes="40px" />
          <span className="min-w-0">
            <span className="block truncate font-semibold tracking-tight text-fg">{symbol}</span>
            <span className="block truncate text-sm text-fg-muted">
              {name}
              {lowLiquidityLabel ? <span> · {lowLiquidityLabel}</span> : null}
            </span>
          </span>
        </span>
        <span className="mt-auto flex items-end justify-between gap-2">
          <span className="flex min-w-0 flex-col items-start gap-1.5">
            <ChangeBadge value={change} className="px-3 py-1 text-base font-semibold" />
            <span className="font-medium">
              <FlashPrice value={price} currency={currency} size="sm" />
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
