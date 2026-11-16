"use client";

import { memo } from "react";
import Link from "next/link";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { FlashPrice } from "@/components/domain/flash-price";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/types";

type MarketRowStatus = { kind: "open" | "closed" | "halted"; label: string };

type AssetMarketRowProps = {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  /** Precio ya resuelto a la moneda que se muestra. `null` si aún no hay cotización. */
  price: number | null;
  currency: Currency;
  /** Variación 24 h; `null` si la cotización no la trae. */
  change: number | null;
  /** Todavía no llega ningún precio: se muestra un marcador, no un cero. */
  pricePending: boolean;
  sparkline?: number[];
  lowLiquidityLabel?: string | null;
  reviewLabel?: string | null;
  reviewHint?: string | null;
  status?: MarketRowStatus | null;
  favoritePressed: boolean;
  favoriteLabel: string;
  /** Estable (`useFavorites`): permite memoizar la fila por contenido. */
  onToggleFavorite: (symbol: string) => void;
  noPriceLabel: string;
  unavailableLabel: string;
  detail?: string;
  selected?: boolean;
  selectionDisabled?: boolean;
  selectionLabel?: string;
  onSelect?: (symbol: string) => void;
  hideFavorite?: boolean;
  trendLabel?: string;
};

/** Marca de estado del catálogo: círculo abierta, rombo suspendida, cuadrado cerrada. */
function StatusMark({ kind }: { kind: MarketRowStatus["kind"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0",
        kind === "open" ? "rounded-full bg-up" : kind === "halted" ? "rotate-45 bg-down" : "rounded-[1px] bg-warn",
      )}
    />
  );
}

/**
 * Fila del mercado: dato, no tarjeta. Ticker en mono, nombre que envuelve
 * (nunca se corta), precio y variación a la derecha con cifras tabulares y la
 * estrella fuera del enlace. En 360 px no hay scroll horizontal: el nombre
 * cede ancho y la cifra conserva su columna.
 */
function AssetMarketRowBase({
  href,
  symbol,
  name,
  logoUrl,
  price,
  currency,
  change,
  pricePending,
  sparkline,
  lowLiquidityLabel = null,
  reviewLabel = null,
  reviewHint = null,
  status = null,
  favoritePressed,
  favoriteLabel,
  onToggleFavorite,
  noPriceLabel,
  unavailableLabel,
  detail,
  selected,
  selectionDisabled,
  selectionLabel,
  onSelect,
  hideFavorite = false,
  trendLabel,
}: AssetMarketRowProps) {
  return (
    <div className="flex min-h-16 items-center transition-colors duration-150 hover:bg-surface-1/70 active:bg-surface-1">
      {onSelect ? <label className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center"><input type="checkbox" checked={selected ?? false} disabled={selectionDisabled} onChange={() => onSelect(symbol)} aria-label={selectionLabel ?? symbol} className="size-4 accent-fg" /></label> : null}
      <Link
        href={href}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pr-1 pl-1 sm:gap-4 sm:py-2"
      >
        <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-mono text-sm leading-5 font-semibold tracking-tight text-fg">{symbol}</span>
            {status ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[13px] leading-4 text-fg-muted"
                title={status.label}
              >
                <StatusMark kind={status.kind} />
                <span className="sr-only">{status.label}</span>
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[13px] leading-4 text-fg-muted">
            <span className="break-words">{name}</span>
            {detail ? <span className="mt-1 hidden text-xs text-fg-subtle sm:block">{detail}</span> : null}
            {lowLiquidityLabel ? <span className="whitespace-nowrap"> · {lowLiquidityLabel}</span> : null}
            {reviewLabel ? (
              <span className="whitespace-nowrap text-warn" title={reviewHint ?? undefined}>
                {" · "}
                {reviewLabel}
              </span>
            ) : null}
          </span>
        </span>
        {sparkline ? (
          <span className="hidden shrink-0 sm:block" title={trendLabel}><Sparkline data={sparkline} change={(sparkline.at(-1) ?? 0) - (sparkline[0] ?? 0)} width={88} height={32} /><span className="sr-only">{trendLabel}</span></span>
        ) : null}
        <span className="flex shrink-0 flex-col items-end gap-1 pl-1 text-right">
          {price === null ? (
            pricePending ? (
              <>
                <span aria-hidden className="block h-5 w-16 rounded-sm bg-surface-2" />
                <span aria-hidden className="block h-4 w-12 rounded-full bg-surface-2" />
              </>
            ) : (
              <>
                <span className="text-[13px] leading-5 whitespace-nowrap text-fg-muted">{noPriceLabel}</span>
                <span className="text-xs leading-4 text-fg-muted">
                  <span aria-hidden>—</span>
                  <span className="sr-only">{unavailableLabel}</span>
                </span>
              </>
            )
          ) : (
            <>
              <span className="flex items-baseline gap-1 whitespace-nowrap">
                <FlashPrice value={price} currency={currency} size="sm" className="-mr-1 font-medium" />
                {currency === "CLP" ? (
                  <span className="text-[11px] leading-none font-medium text-fg-muted">CLP</span>
                ) : null}
              </span>
              {change === null ? (
                <span className="text-xs leading-4 text-fg-muted">
                  <span aria-hidden>—</span>
                  <span className="sr-only">{unavailableLabel}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1"><ChangeBadge value={change} size="sm" /><span className="sr-only">24 h</span></span>
              )}
            </>
          )}
        </span>
      </Link>
      {!hideFavorite ? <div className="flex shrink-0 items-center pr-1">
        <FavoriteButton pressed={favoritePressed} label={favoriteLabel} onToggle={() => onToggleFavorite(symbol)} />
      </div> : null}
    </div>
  );
}

/** Sólo re-pinta la fila si cambia lo que se ve: la lista llega cada 15 s. */
function sameAssetMarketRow(prev: AssetMarketRowProps, next: AssetMarketRowProps): boolean {
  return (
    prev.href === next.href &&
    prev.symbol === next.symbol &&
    prev.name === next.name &&
    prev.logoUrl === next.logoUrl &&
    prev.price === next.price &&
    prev.currency === next.currency &&
    prev.change === next.change &&
    prev.pricePending === next.pricePending &&
    prev.sparkline === next.sparkline &&
    prev.lowLiquidityLabel === next.lowLiquidityLabel &&
    prev.reviewLabel === next.reviewLabel &&
    prev.reviewHint === next.reviewHint &&
    prev.status?.kind === next.status?.kind &&
    prev.status?.label === next.status?.label &&
    prev.favoritePressed === next.favoritePressed &&
    prev.favoriteLabel === next.favoriteLabel &&
    prev.noPriceLabel === next.noPriceLabel &&
    prev.unavailableLabel === next.unavailableLabel &&
    prev.onToggleFavorite === next.onToggleFavorite
    && prev.detail === next.detail
    && prev.selected === next.selected
    && prev.selectionDisabled === next.selectionDisabled
    && prev.selectionLabel === next.selectionLabel
    && prev.onSelect === next.onSelect
    && prev.hideFavorite === next.hideFavorite
    && prev.trendLabel === next.trendLabel
  );
}

export const AssetMarketRow = memo(AssetMarketRowBase, sameAssetMarketRow);
