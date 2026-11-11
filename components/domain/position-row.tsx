import type { ReactNode } from "react";
import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatPortion, formatShares, type MoneyCurrency } from "@/lib/format";

/**
 * Rejilla compartida por la fila y por la cabecera de columnas de la cartera:
 * así "Valor actual" y "Resultado" quedan alineados sin repetir anchos a ojo.
 * Móvil: logo · nombre · cifras apiladas. Desktop: logo · nombre · valor · resultado.
 */
export const POSITION_ROW_GRID =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem_8.5rem] sm:gap-x-4";

/** Hueco del botón Vender en desktop; la cabecera de la tabla reserva el mismo. */
export const POSITION_ACTION_WIDTH = "w-[4.75rem]";

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
  weightPct = null,
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
  /** Peso de la posición sobre el total de la cartera (ratio 0-1). Opcional. */
  weightPct?: number | null;
  hidden: boolean;
  hiddenLabel: string;
  pending?: boolean;
  /** Fuera del enlace de la fila. No anidar otro link o botón. */
  action?: ReactNode;
}) {
  const weight =
    weightPct !== null && Number.isFinite(weightPct) ? formatPortion(Math.max(0, weightPct)) : null;

  return (
    <div className="flex items-center gap-3">
      <Link
        href={href}
        className={cn(
          POSITION_ROW_GRID,
          "min-h-[4.5rem] min-w-0 flex-1 rounded-2xl py-3 transition-colors duration-150 hover:bg-bg active:bg-bg",
        )}
      >
        <TickerLogo
          symbol={symbol}
          name={name}
          logoUrl={logoUrl}
          size={36}
          decorative
          loading="lazy"
          sizes="40px"
        />

        <span className="min-w-0">
          <span className="block truncate text-[15px] leading-tight font-medium tracking-tight text-fg">
            {name}
          </span>
          <span className="mt-1 flex min-w-0 items-baseline gap-1.5 text-[13px] leading-none text-fg-muted">
            <Tooltip content={shareHint}>
              <span className="num tabular-nums">{formatShares(shares)}</span>
            </Tooltip>
            <span className="sr-only">. {shareHint}</span>
            {weight ? (
              <>
                <span aria-hidden className="text-fg-subtle">
                  ·
                </span>
                <span className="num tabular-nums text-fg-subtle">{weight}</span>
              </>
            ) : null}
          </span>
        </span>

        {/* Móvil: valor y resultado apilados a la derecha. Desktop: dos celdas. */}
        <span className="flex flex-col items-end gap-1 sm:contents">
          <span className="text-right">
            {hidden ? (
              <MaskedFigures label={hiddenLabel} />
            ) : pending ? (
              <Skeleton className="ml-auto h-4 w-20" />
            ) : (
              <FlashPrice
                value={value}
                currency={currency}
                size="sm"
                className="text-[15px] font-medium tracking-tight text-fg"
              />
            )}
          </span>

          <span className="flex items-center gap-1.5 sm:justify-end">
            {hidden ? null : pending ? (
              <Skeleton className="ml-auto h-4 w-16" />
            ) : pnl === null ? (
              <span className="num hidden text-[13px] tabular-nums text-fg-subtle sm:inline">—</span>
            ) : (
              <FlashPrice
                value={pnl}
                currency={currency}
                size="sm"
                colorBySign
                className="hidden text-[13px] tracking-tight tabular-nums sm:inline"
              />
            )}
            {hidden ? null : !pending && pnlPct !== null ? (
              <ChangeBadge value={pnlPct} size="sm" className="shrink-0" />
            ) : null}
          </span>
        </span>
      </Link>

      <div
        className={cn(
          "hidden shrink-0 items-center justify-end sm:flex",
          POSITION_ACTION_WIDTH,
        )}
      >
        {action}
      </div>
    </div>
  );
}

function MaskedFigures({ label }: { label: string }) {
  return (
    <>
      <span className="num text-[15px] tracking-[0.16em] text-fg" aria-hidden>
        ••••••
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}
