"use client";

import { useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { LandingQuote } from "@/lib/mocks/landing";

const SAMPLE_AMOUNTS = [10, 50, 100, 500] as const;

const PILLS = ["Comisión: 0%", "Liquidación: Solana SPL", "Horario: 24/7"] as const;

const CHIP_BASE =
  "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full border px-4 text-sm font-medium tabular-nums outline-none transition-colors duration-[140ms] ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 motion-safe:active:scale-[0.98] motion-reduce:transition-none";

/**
 * Ficha de ejemplo del catálogo sin serie (M42): el historial live no
 * es real, así que la portada muestra sólo precio en dólares (US$) y cambio
 * 24 h, ambos en vivo cuando la fuente responde.
 *
 * Incluye un simulador visual de fracciones: el monto elegido (US$10–500) se
 * divide por el precio actual para estimar cuántas acciones tokenizadas
 * equivalen a ese monto. Es un cálculo referencial; no envía órdenes.
 */
export function LandingQuotePreview({ quote }: { quote: LandingQuote }) {
  const { priceUsd, change } = useLandingQuote(quote.symbol, {
    priceUsd: quote.priceUsd,
    change: quote.change,
  });

  const [sampleUsd, setSampleUsd] = useState(100);

  const priceValid = Number.isFinite(priceUsd) && priceUsd > 0;
  const fractions = priceValid ? (sampleUsd / priceUsd).toFixed(4) : "—";

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
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <FlashPrice value={priceUsd} currency="USD" size="lg" />
        <span className="pb-1 text-xs text-fg-muted">por acción</span>
      </div>

      <div className="flex flex-col gap-4 border-t border-border/70 pt-5">
        <div className="flex flex-col gap-2">
          <p className="label">Monto de ejemplo</p>
          <div role="group" aria-label="Monto de ejemplo en dólares" className="flex flex-wrap gap-2">
            {SAMPLE_AMOUNTS.map((amount) => {
              const active = sampleUsd === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSampleUsd(amount)}
                  className={cn(
                    CHIP_BASE,
                    active
                      ? "border-fg bg-fg text-bg"
                      : "border-border bg-bg text-fg-body hover:border-border-strong hover:text-fg",
                  )}
                >
                  US${amount}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-fg-muted">Equivale a</p>
            <p className="font-mono text-xs tabular-nums text-fg-muted">
              {priceValid ? `${quote.symbol} · US$${sampleUsd}` : quote.symbol}
            </p>
          </div>

          <p aria-live="polite" className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-fg">
            <span className="font-mono text-2xl font-medium tabular-nums tracking-tight sm:text-3xl md:text-4xl">
              {fractions}
            </span>
            <span className="text-sm font-medium">{quote.symbol}</span>
            <span className="text-sm text-fg-muted">acciones tokenizadas</span>
          </p>

          <p className="mt-3 text-xs leading-relaxed text-fg-muted">Cálculo referencial al precio mostrado.</p>

          <ul className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-4">
            {PILLS.map((pill) => (
              <li
                key={pill}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-fg-body"
              >
                <span className="size-1.5 rounded-full bg-fg/40" aria-hidden />
                {pill}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={buttonClasses({ size: "md", className: "pointer-events-none min-h-11" })} aria-hidden>
          Comprar
        </span>
        <p className="text-sm text-fg-muted">Botón de ejemplo. No envía una orden.</p>
      </div>
    </div>
  );
}
