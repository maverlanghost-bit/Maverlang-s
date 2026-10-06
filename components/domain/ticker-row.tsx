import type { ReactNode } from "react";
import Link from "next/link";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { MoneyCurrency } from "@/lib/format";

export function TickerRow({
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
    <div className="flex h-16 items-center rounded-xl transition duration-[140ms] hover:bg-surface-2">
      <Link
        href={href}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl px-2 sm:gap-3 sm:px-3"
      >
        <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate font-medium text-fg">
            {statusDot ? (
              <span className="inline-flex shrink-0 items-center" aria-hidden>
                <span className={`size-1.5 rounded-full ${dotClass}`} />
              </span>
            ) : null}
            <span className="truncate">{symbol}</span>
            {statusDot ? <span className="sr-only">({statusDot.label})</span> : null}
          </span>
          <span className="block truncate text-sm text-fg-muted">
            {name}
            {lowLiquidityLabel ? <span> · {lowLiquidityLabel}</span> : null}
          </span>
        </span>
        {sparkline ? <Sparkline data={sparkline} width={72} height={28} className={sparklineClassName} /> : null}
        {priceSlot ?? (
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <FlashPrice value={price} currency={currency} size="sm" />
            <ChangeBadge value={change} />
          </span>
        )}
      </Link>
      {action ? <div className="shrink-0 pr-1">{action}</div> : null}
    </div>
  );
}
