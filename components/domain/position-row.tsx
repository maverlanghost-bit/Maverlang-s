import type { ReactNode } from "react";
import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceText } from "@/components/domain/price-text";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShares, type MoneyCurrency } from "@/lib/format";

export function PositionRow({
  href,
  symbol,
  name,
  logoUrl,
  shares,
  shareHint,
  value,
  currency,
  pnl,
  pnlPct,
  hidden,
  hiddenLabel,
  pending = false,
  action,
}: {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  /** Acciones ya ajustadas por el multiplicador del emisor. */
  shares: number;
  shareHint: string;
  value: number;
  currency: MoneyCurrency;
  pnl: number | null;
  pnlPct: number | null;
  hidden: boolean;
  hiddenLabel: string;
  pending?: boolean;
  /** Fuera del enlace de la fila. No anidar otro link o botón. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <Link href={href} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-3 transition duration-[140ms] hover:bg-surface-2">
        <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{name}</span>
          <span className="mt-0.5 block text-sm text-fg-muted">
            <Tooltip content={shareHint}>
              <span className="num">{formatShares(shares)}</span>
            </Tooltip>
            <span className="sr-only">. {shareHint}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {hidden ? (
            <HiddenFigures label={hiddenLabel} />
          ) : pending ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <>
              <PriceText value={value} currency={currency} size="sm" />
              <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                {pnl === null ? <span className="num text-sm text-fg-muted">—</span> : <PriceText value={pnl} currency={currency} size="sm" colorBySign />}
                {pnlPct === null ? <span className="num text-sm text-fg-muted">—</span> : <ChangeBadge value={pnlPct} />}
              </span>
            </>
          )}
        </span>
      </Link>
      {action}
    </div>
  );
}

function HiddenFigures({ label }: { label: string }) {
  return (
    <>
      <span className="num text-sm tracking-[0.18em] text-fg" aria-hidden>
        ••••••
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}
