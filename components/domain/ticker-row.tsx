import { isValidElement, memo, type ReactNode } from "react";
import Link from "next/link";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { MoneyCurrency } from "@/lib/format";

function TickerRowBase({
  href,
  symbol,
  name,
  logoUrl,
  price,
  currency = "USD",
  change,
  sparkline,
  sparklineClassName = "hidden sm:block",
  action,
  lowLiquidityLabel = null,
  statusDot = null,
  reviewLabel = null,
  reviewHint = null,
  priceSlot = null,
}: {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  price: number;
  currency?: MoneyCurrency;
  change: number;
  sparkline?: number[];
  /** Por defecto se oculta bajo `sm`, como en la landing. */
  sparklineClassName?: string;
  /** Control al lado del link (por ejemplo, favorito). No va dentro del enlace. */
  action?: ReactNode;
  /** Etiqueta discreta de baja liquidez (M38). Null la oculta. */
  lowLiquidityLabel?: string | null;
  /** Punto de estado por fila desde el catálogo (M39). Null lo oculta. */
  statusDot?: { kind: "open" | "closed" | "halted"; label: string } | null;
  /** Chip discreto "En revisión" (M54, filas `watch`). Null lo oculta. */
  reviewLabel?: string | null;
  /** Tooltip del chip de revisión (mismo texto que el CTA deshabilitado). */
  reviewHint?: string | null;
  /**
   * Números en vivo de la portada (M42): reemplaza el bloque de precio y
   * cambio (p. ej. `<LandingPrice>`). El mercado no lo usa.
   */
  priceSlot?: ReactNode;
}) {
  const dotClass =
    statusDot?.kind === "open"
      ? "bg-up"
      : statusDot?.kind === "halted"
        ? "bg-down"
        : "bg-warn";
  return (
    <div className="flex min-h-14 items-center rounded-2xl border border-border/70 transition-colors duration-150 hover:bg-surface-1/80 active:bg-surface-2/60">
      <Link
        href={href}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-1 sm:gap-3 sm:px-3"
      >
        <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold tracking-tight text-fg">
            <span className="truncate">{symbol}</span>
            {statusDot ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 ${
                    statusDot.kind === "open"
                      ? "rounded-full"
                      : statusDot.kind === "halted"
                        ? "rotate-45"
                        : "rounded-sm"
                  } ${dotClass}`}
                />
                {statusDot.label}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-sm text-fg-muted">
            {name}
            {lowLiquidityLabel ? <span> · {lowLiquidityLabel}</span> : null}
          </span>
          {reviewLabel ? (
            <span
              className="mt-1 inline-flex w-fit items-center rounded-full border border-border/70 bg-surface-2/60 px-2 py-0.5 text-xs leading-4 font-medium text-fg-muted"
              title={reviewHint ?? undefined}
            >
              {reviewLabel}
            </span>
          ) : null}
        </span>
        {sparkline ? <Sparkline data={sparkline} width={72} height={28} className={sparklineClassName} /> : null}
        {priceSlot ?? (
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-right font-medium tabular-nums">
            <FlashPrice value={price} currency={currency} size="sm" />
            <ChangeBadge value={change} />
          </span>
        )}
      </Link>
      {action ? <div className="shrink-0 pr-1">{action}</div> : null}
    </div>
  );
}

/**
 * M84: una fila del mercado no se re-renderiza con cada tick de precios de
 * las otras. `memo` con comparador por contenido: sólo re-pinta si cambian
 * los datos visibles de esta fila (precio, variación, sparkline, favorito…).
 * `action` y `priceSlot` son JSX inline del padre (cambian de identidad en
 * cada render aunque el contenido sea igual): se comparan por lo que pinta
 * el favorito (estado `pressed`) y por el placeholder, no por referencia.
 */
function sameRow(prev: TickerRowProps, next: TickerRowProps): boolean {
  if (
    prev.href !== next.href ||
    prev.symbol !== next.symbol ||
    prev.name !== next.name ||
    prev.logoUrl !== next.logoUrl ||
    prev.price !== next.price ||
    prev.currency !== next.currency ||
    prev.change !== next.change ||
    prev.sparkline !== next.sparkline ||
    prev.sparklineClassName !== next.sparklineClassName ||
    prev.lowLiquidityLabel !== next.lowLiquidityLabel ||
    prev.statusDot?.kind !== next.statusDot?.kind ||
    prev.statusDot?.label !== next.statusDot?.label ||
    prev.reviewLabel !== next.reviewLabel ||
    prev.reviewHint !== next.reviewHint
  ) {
    return false;
  }
  if (prev.action === next.action && prev.priceSlot === next.priceSlot) return true;
  // Ambos lados son nodos React (JSX inline). Igualdad por referencia basta
  // para detectar el placeholder del precio; para el botón de favorito se
  // compara el estado `pressed` que es lo único que cambia su pintado.
  const pressedOf = (node: ReactNode): boolean | undefined => {
    if (!isValidElement(node)) return undefined;
    const props = node.props as { pressed?: boolean };
    return typeof props.pressed === "boolean" ? props.pressed : undefined;
  };
  const prevPressed = pressedOf(prev.action);
  const nextPressed = pressedOf(next.action);
  if (prevPressed !== undefined && nextPressed !== undefined && prevPressed !== nextPressed) return false;
  const prevPlaceholder = prev.priceSlot === null || prev.priceSlot === undefined;
  const nextPlaceholder = next.priceSlot === null || next.priceSlot === undefined;
  return prevPlaceholder === nextPlaceholder;
}

/** Props del memo (M84): exportadas para el comparador `sameRow`. */
export type TickerRowProps = {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  price: number;
  currency?: MoneyCurrency;
  change: number;
  sparkline?: number[];
  sparklineClassName?: string;
  action?: ReactNode;
  lowLiquidityLabel?: string | null;
  statusDot?: { kind: "open" | "closed" | "halted"; label: string } | null;
  reviewLabel?: string | null;
  reviewHint?: string | null;
  priceSlot?: ReactNode;
};

export const TickerRow = memo(TickerRowBase, sameRow);
