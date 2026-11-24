"use client";

import { memo } from "react";
import Link from "next/link";

import { FavoriteButton } from "@/components/domain/favorite-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { IconArrow } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Currency } from "@/lib/types";

type Props = {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  price: number | null;
  currency: Currency;
  change: number | null;
  pricePending: boolean;
  favoritePressed: boolean;
  favoriteLabel: string;
  onToggleFavorite: (symbol: string) => void;
  noPriceLabel: string;
  unavailableLabel: string;
};

/** Fila de «Precios» en celular: logo, nombre y símbolo a la izquierda; precio y variación a la derecha. Sin tarjeta ni borde. */
function MobileAssetRowBase({
  href,
  symbol,
  name,
  logoUrl,
  price,
  currency,
  change,
  pricePending,
  favoritePressed,
  favoriteLabel,
  onToggleFavorite,
  noPriceLabel,
  unavailableLabel,
}: Props) {
  const direction = change === null ? "flat" : change > 0 ? "up" : change < 0 ? "down" : "flat";
  return (
    <div className="flex min-h-[68px] items-center">
      <Link href={href} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-2 active:opacity-70">
        <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={40} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base leading-5 font-semibold text-fg">{name}</span>
          <span className="mt-0.5 block text-sm leading-5 text-fg-muted">{symbol}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {price === null ? (
            pricePending ? (
              <>
                <span aria-hidden className="block h-5 w-16 rounded-sm bg-surface-2" />
                <span aria-hidden className="mt-1 block h-4 w-12 rounded-sm bg-surface-2" />
              </>
            ) : (
              <>
                <span className="text-sm leading-5 text-fg-muted">{noPriceLabel}</span>
                <span className="sr-only">{unavailableLabel}</span>
              </>
            )
          ) : (
            <>
              <span className="tabular-nums text-base leading-5 font-semibold whitespace-nowrap text-fg">
                {formatMoney(price, currency)}
                {currency === "CLP" ? <span className="ml-1 text-[11px] font-medium text-fg-muted">CLP</span> : null}
              </span>
              {change === null ? (
                <span className="mt-0.5 text-sm leading-5 text-fg-muted" aria-hidden>—</span>
              ) : (
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 text-sm leading-5 font-medium tabular-nums",
                    direction === "up" && "text-up",
                    direction === "down" && "text-down",
                    direction === "flat" && "text-fg-muted",
                  )}
                >
                  <IconArrow direction={direction} className="size-3" />
                  <span className="sr-only">{direction === "up" ? "Sube" : direction === "down" ? "Baja" : "Sin cambio"}</span>
                  {formatPercent(change)}
                </span>
              )}
            </>
          )}
        </span>
      </Link>
      <div className="-mr-2 flex shrink-0 items-center">
        <FavoriteButton pressed={favoritePressed} label={favoriteLabel} onToggle={() => onToggleFavorite(symbol)} />
      </div>
    </div>
  );
}

export const MobileAssetRow = memo(MobileAssetRowBase);
