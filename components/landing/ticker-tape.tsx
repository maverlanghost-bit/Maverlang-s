"use client";

import { useState } from "react";
import { LandingPrice } from "@/components/landing/live-landing-prices";
import { formatPercent, formatUsd } from "@/lib/format";
import type { LandingQuote } from "@/lib/mocks/landing";

function changeWord(change: number) {
  if (change > 0) return "sube";
  if (change < 0) return "baja";
  return "sin cambio";
}

/** Cinta animada con botón de pausa. El aviso de origen llega ya armado desde el servidor. */
export function TickerTape({ quotes, notice }: { quotes: LandingQuote[]; notice: string }) {
  const tape = [...quotes, ...quotes];
  const [paused, setPaused] = useState(false);

  return (
    <section
      aria-label="Cinta de precios"
      className={`overflow-hidden border-y border-border py-6 md:py-8${paused ? " ticker-marquee-paused" : ""}`}
    >
      <div className="mb-4 flex justify-center px-5">
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#767676] bg-bg px-4 text-sm font-medium text-fg transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
        >
          {paused ? "Reanudar precios" : "Pausar precios"}
        </button>
      </div>
      <div className="ticker-marquee-motion" aria-hidden>
        <ul className="flex w-max animate-marquee will-change-transform">
          {tape.map((quote, index) => (
            <li key={`${quote.symbol}-${index}`} className="flex">
              <LandingPrice
                symbol={quote.symbol}
                initial={{ priceUsd: quote.priceUsd, change: quote.change }}
                layout="tape"
              />
            </li>
          ))}
        </ul>
      </div>

      <ul className="ticker-marquee-static flex-wrap justify-center gap-x-2 gap-y-2 px-5" aria-hidden>
        {quotes.map((quote) => (
          <li key={quote.symbol}>
            <LandingPrice
              symbol={quote.symbol}
              initial={{ priceUsd: quote.priceUsd, change: quote.change }}
              layout="tape"
            />
          </li>
        ))}
      </ul>

      <p className="mt-5 px-5 text-center text-sm leading-relaxed text-fg-muted">
        Opera con más de 400 acciones tokenizadas.
      </p>

      <p className="sr-only">{notice}</p>
      <ul className="sr-only">
        {quotes.map((quote) => (
          <li key={quote.symbol}>
            {quote.name} ({quote.symbol}): {formatUsd(quote.priceUsd)}, {changeWord(quote.change)}{" "}
            {formatPercent(quote.change)}.
          </li>
        ))}
      </ul>
    </section>
  );
}
