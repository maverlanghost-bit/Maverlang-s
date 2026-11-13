import { isValidElement, memo, type ReactNode } from "react";
import Link from "next/link";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { cn } from "@/lib/cn";
import type { MoneyCurrency } from "@/lib/format";

/** Marca de estado del catálogo: círculo abierta, rombo suspendida, cuadrado cerrada. */
function StatusMarker({ kind }: { kind: "open" | "closed" | "halted" }) {
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
  /** Estado de la acción en el catálogo (M39). Null lo oculta. */
  statusDot?: { kind: "open" | "closed" | "halted"; label: string } | null;
  /** «En revisión» (M54, filas `watch`). Null lo oculta. */
  reviewLabel?: string | null;
  /** Tooltip de la nota de revisión (mismo texto que el CTA deshabilitado). */
  reviewHint?: string | null;
  /**
   * Números en vivo de la portada (M42): reemplaza el bloque de precio y
   * cambio (p. ej. `<LandingPrice>`). El mercado no lo usa.
   */
  priceSlot?: ReactNode;
}) {
  return (
    <div className="flex min-h-16 items-center transition-colors duration-150 hover:bg-surface-1/70 active:bg-surface-1">
      <Link href={href} className="flex min-h-16 min-w-0 flex-1 items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3">
        <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-sm font-semibold tracking-tight text-fg" title={symbol}>
              {symbol}
            </span>
            {statusDot ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[13px] text-fg-muted sm:hidden"
                title={statusDot.label}
              >
                <StatusMarker kind={statusDot.kind} />
                <span className="sr-only">{statusDot.label}</span>
              </span>
            ) : null}
          </span>

          {/* Nombre y estado en una sola línea: la fila mantiene el mismo alto
              en toda la tabla. Las notas (baja liquidez, en revisión) pasan a
              una línea propia sólo en móvil, para no comerse el nombre. */}
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] leading-4 text-fg-muted">
            <span className="truncate" title={name}>
              {name}
            </span>
            {lowLiquidityLabel ? <span className="hidden shrink-0 sm:inline">· {lowLiquidityLabel}</span> : null}
            {statusDot ? (
              <span className="hidden shrink-0 items-center gap-1 sm:inline-flex" title={statusDot.label}>
                <span aria-hidden>·</span>
                <StatusMarker kind={statusDot.kind} />
                {statusDot.label}
              </span>
            ) : null}
            {reviewLabel ? (
              <span className="hidden shrink-0 text-warn sm:inline" title={reviewHint ?? undefined}>
                · {reviewLabel}
              </span>
            ) : null}
          </span>

          {lowLiquidityLabel || reviewLabel ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] leading-4 text-fg-muted sm:hidden">
              {lowLiquidityLabel ? <span>{lowLiquidityLabel}</span> : null}
              {reviewLabel ? (
                <span className="text-warn" title={reviewHint ?? undefined}>
                  {reviewLabel}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        {sparkline ? <Sparkline data={sparkline} change={change} width={88} height={32} className={sparklineClassName} /> : null}
        {priceSlot ?? (
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-right font-medium tabular-nums">
            <span className="flex items-baseline gap-1 whitespace-nowrap">
              <FlashPrice value={price} currency={currency} size="sm" className="-mr-1" />
              {currency === "CLP" ? (
                <span className="text-xs leading-none font-medium text-fg-muted">CLP</span>
              ) : null}
            </span>
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
