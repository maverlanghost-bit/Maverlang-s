"use client";

import { useId, useState } from "react";

import { TickerLogo } from "@/components/domain/ticker-logo";
import { useLandingQuote } from "@/components/landing/live-landing-prices";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import type { LandingQuote } from "@/lib/mocks/landing";

/**
 * Calculadora de fracciones (T90). Elige acción y monto y muestra cuánto
 * recibes al precio de la cotización mostrada (la misma de la cinta). El anillo
 * es la parte de UNA acción que cubre el monto; si alcanza para una o más
 * enteras, lo dice aparte. Es una cuenta, no una cotización ejecutable.
 */

const AMOUNTS = [10, 50, 100, 500] as const;
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

const sharesFormatter = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const percentFormatter = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });

export function FractionCalculator({ quotes, minUsd }: { quotes: LandingQuote[]; minUsd: number }) {
  // Apple por defecto: es la misma acción que compra el teléfono del hero.
  const [symbol, setSymbol] = useState((quotes.find((quote) => quote.symbol === "AAPLx") ?? quotes[0])?.symbol ?? "");
  const [amount, setAmount] = useState<number>(AMOUNTS[1]);
  const stockLabel = useId();
  const amountLabel = useId();
  const selected = quotes.find((quote) => quote.symbol === symbol) ?? quotes[0];
  const live = useLandingQuote(selected?.symbol ?? "", selected ? { priceUsd: selected.priceUsd, change: selected.change } : undefined);

  if (!selected || !(live.priceUsd > 0)) {
    return (
      <div className="rounded-[28px] border border-border bg-bg p-8 text-sm text-fg-muted">
        Las cotizaciones no están disponibles en este momento.
      </div>
    );
  }

  const shares = amount / live.priceUsd;
  const whole = Math.floor(shares);
  const part = shares - whole;
  const ringPart = whole >= 1 ? 1 : part;

  return (
    <div className="rounded-[28px] border border-border bg-bg p-5 shadow-frame sm:p-7">
      <p id={stockLabel} className="text-[13px] font-medium text-fg-muted">Acción</p>
      <div role="group" aria-labelledby={stockLabel} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quotes.map((quote) => {
          const active = quote.symbol === selected.symbol;
          return (
            <button
              key={quote.symbol}
              type="button"
              aria-pressed={active}
              onClick={() => setSymbol(quote.symbol)}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-2xl border px-2.5 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                active ? "border-fg bg-fg text-bg" : "border-border bg-surface-1 text-fg hover:border-border-strong",
              )}
            >
              <TickerLogo symbol={quote.symbol} name={quote.name} logoUrl={quote.logo} size={24} decorative />
              <span className="truncate">{quote.underlying}</span>
            </button>
          );
        })}
      </div>

      <p id={amountLabel} className="mt-5 text-[13px] font-medium text-fg-muted">Monto</p>
      <div role="group" aria-labelledby={amountLabel} className="mt-2 flex flex-wrap gap-2">
        {AMOUNTS.map((value) => {
          const active = value === amount;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setAmount(value)}
              className={cn(
                "num relative inline-flex h-10 min-w-[4.5rem] items-center justify-center rounded-full border px-4 text-[14px] transition-colors duration-150 before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                active ? "border-fg bg-fg text-bg" : "border-border bg-surface-1 text-fg-body hover:border-border-strong hover:text-fg",
              )}
            >
              US${value}
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex items-center gap-5 border-t border-border pt-6 sm:gap-7">
        <svg viewBox="0 0 120 120" className="size-24 shrink-0 -rotate-90 sm:size-28" aria-hidden>
          <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r={RING_R}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - Math.max(ringPart, 0.015))}
            className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
          />
        </svg>
        <div className="min-w-0" aria-live="polite">
          <p className="text-[13px] text-fg-muted">Recibes cerca de</p>
          <p className="num text-[clamp(2rem,1.5rem+2.2vw,2.75rem)] leading-none tracking-tight text-fg">
            {sharesFormatter.format(shares)}
          </p>
          <p className="mt-1.5 text-[14px] text-fg-body">
            {whole >= 1
              ? `acciones de ${selected.name}: ${whole === 1 ? "una entera" : `${whole} enteras`} y una parte.`
              : `acciones de ${selected.name}: el ${percentFormatter.format(part)} de una.`}
          </p>
        </div>
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-fg-muted">
        Cuenta al precio mostrado ({formatUsd(live.priceUsd)}). La cantidad exacta se confirma al operar. Mínimo por orden: US${minUsd}.
      </p>
    </div>
  );
}
