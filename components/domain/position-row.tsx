import type { ReactNode } from "react";
import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney, formatPortion, formatShares, type MoneyCurrency } from "@/lib/format";

/**
 * Retícula compartida por la fila y por la cabecera de columnas de la cartera.
 *
 * Móvil (3 columnas): logo + nombre arriba, cantidad debajo y las cifras a la
 * derecha en dos líneas. Escritorio (5 columnas): activo · cantidad · precio ·
 * valor · resultado; la acción vive fuera del enlace, en su propia columna.
 */
export const POSITION_ROW_GRID =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_6.5rem_6rem_7rem_6.5rem] md:gap-x-4 md:gap-y-0 xl:grid-cols-[minmax(0,1fr)_7.5rem_7rem_8rem_7.5rem] xl:gap-x-6";

/** Hueco de la acción en escritorio; la cabecera de la tabla reserva el mismo. */
export const POSITION_ACTION_WIDTH = "w-[4.5rem]";

export function PositionRow({
  href,
  symbol,
  name,
  logoUrl,
  shares,
  shareHint,
  price,
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
  /** Precio por acción en la moneda visible de la pantalla. */
  price: number | null;
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
    <div className="flex items-center gap-2 md:gap-4">
      <Link
        href={href}
        className={cn(
          POSITION_ROW_GRID,
          "-mx-2 min-h-14 min-w-0 flex-1 rounded-xl px-2 py-3 transition-colors duration-150 hover:bg-surface-1/70 active:bg-surface-1",
        )}
      >
        <span className="flex min-w-0 items-center gap-3 max-md:col-span-2 md:col-start-1 md:row-start-1">
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
            <span className="mt-1 flex min-w-0 items-baseline gap-1.5 text-[13px] leading-none">
              <span className="num shrink-0 text-fg-muted">{symbol}</span>
              {weight ? (
                <>
                  <span aria-hidden className="text-fg-muted">
                    ·
                  </span>
                  <span className="num shrink-0 text-fg-muted">{weight}</span>
                </>
              ) : null}
            </span>
          </span>
        </span>

        {/* Valor actual: la cifra que se mira primero, siempre a la derecha.
            Es un div (no span) porque el estado de carga es un bloque. */}
        <div className="min-w-0 text-right md:col-start-4 md:row-start-1">
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
        </div>

        {/* Cantidad: bajo el nombre en móvil, columna propia en escritorio. */}
        <span className="num min-w-0 truncate text-[13px] leading-none text-fg-muted max-md:col-span-2 max-md:pl-12 md:col-start-2 md:row-start-1 md:text-right">
          {formatShares(shares)}
          <span className="sr-only">. {shareHint}</span>
        </span>

        {/* Precio por acción: sólo escritorio (en móvil mandan cantidad y valor). */}
        <div className="num text-right text-[13px] text-fg-muted max-md:hidden md:col-start-3 md:row-start-1">
          {hidden ? (
            <span className="tracking-[0.16em]" aria-hidden>
              ••••
            </span>
          ) : pending ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : price === null ? (
            <span className="text-fg-muted">—</span>
          ) : (
            formatMoney(price, currency)
          )}
        </div>

        <div className="flex items-center justify-end gap-2 max-md:col-start-3 md:col-start-5 md:row-start-1 md:flex-col md:items-end md:gap-1">
          {hidden ? null : pending ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : pnl === null ? (
            <span className="num hidden text-[13px] tabular-nums text-fg-muted max-md:hidden md:inline">—</span>
          ) : (
            <FlashPrice
              value={pnl}
              currency={currency}
              size="sm"
              colorBySign
              className="hidden text-[13px] tracking-tight tabular-nums max-md:hidden md:inline"
            />
          )}
          {hidden ? null : !pending && pnlPct !== null ? (
            <ChangeBadge value={pnlPct} className="shrink-0" />
          ) : null}
        </div>
      </Link>

      <div className={cn("hidden shrink-0 items-center justify-end md:flex", POSITION_ACTION_WIDTH)}>
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
