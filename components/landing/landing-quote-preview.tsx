"use client";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { buttonClasses } from "@/components/ui/button";
import type { LandingQuote } from "@/lib/mocks/landing";

/**
 * Ficha de ejemplo del catálogo sin serie (M42): el historial live no
 * es real, así que la portada muestra sólo precio en dólares (US$) y cambio
 * 24 h, ambos en vivo cuando la fuente responde.
 */
export function LandingQuotePreview({ quote }: { quote: LandingQuote }) {
  const { priceUsd, change } = useLandingQuote(quote.symbol, {
    priceUsd: quote.priceUsd,
    change: quote.change,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TickerLogo symbol={quote.symbol} name={quote.name} logoUrl={quote.logo} size={48} decorative />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-fg">{quote.name}</p>
            <p className="truncate text-sm text-fg-muted">{quote.underlying}</p>
          </div>
        </div>
        <ChangeBadge value={change} />
      </div>
      <FlashPrice value={priceUsd} currency="USD" size="lg" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={buttonClasses({ size: "md", className: "pointer-events-none min-h-11" })} aria-hidden>
          Comprar
        </span>
        <p className="text-sm text-fg-muted">Botón de ejemplo. No envía una orden.</p>
      </div>
    </div>
  );
}
