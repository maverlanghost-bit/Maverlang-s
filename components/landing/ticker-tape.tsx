"use client";

import { useState } from "react";
import { LandingPrice, useLandingStatus } from "@/components/landing/live-landing-prices";
import { cn } from "@/lib/cn";
import { formatPercent, formatUsd } from "@/lib/format";
import type { LandingQuote } from "@/lib/mocks/landing";

function changeWord(change: number) {
  if (change > 0) return "sube";
  if (change < 0) return "baja";
  return "sin cambio";
}

/** Aviso de horario: vivía en el hero y se movió al pie de la cinta (no se borró). */
const SCHEDULE_NOTE =
  "Operar on-chain es 24/7; fuera del horario de la bolsa de EE.UU. (9:30 a 16:00, hora de Nueva York, lunes a viernes) hay menos liquidez y el precio puede variar más.";

/** Degradado en los bordes: la cinta corta sin aviso; esto avisa que sigue. */
const EDGE_MASK =
  "[mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]";

/** Alto de una fila de la cinta: el bloque no cambia de alto al pausar. */
const TAPE_ROW_HEIGHT = "min-h-[3.25rem]";

/** Cinta animada con botón de pausa. El aviso de origen llega ya armado desde el servidor. */
export function TickerTape({
  quotes,
  notice,
  live = false,
}: {
  quotes: LandingQuote[];
  notice: string;
  /** Precios reales en pantalla; con el refetch caído el rótulo lo dice. */
  live?: boolean;
}) {
  const tape = [...quotes, ...quotes];
  const [paused, setPaused] = useState(false);
  const { stale } = useLandingStatus();
  const label = !live
    ? "Precios del catálogo · ilustrativos"
    : stale
      ? "Precios del catálogo · sin actualizar"
      : "Precios del catálogo · en vivo";

  return (
    <section
      aria-label="Cinta de precios"
      className={cn("overflow-hidden border-y border-border py-10 md:py-12", paused && "ticker-marquee-paused")}
    >
      {/* Cabecera propia: el control de pausa deja de flotar solo entre bloques. */}
      <div className="mx-auto mb-2 flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5">
        <p className="label">{label}</p>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="inline-flex min-h-11 items-center whitespace-nowrap text-xs font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none"
        >
          {paused ? "Reanudar precios" : "Pausar precios"}
        </button>
      </div>

      <div className={cn("ticker-marquee-motion flex items-center", TAPE_ROW_HEIGHT, EDGE_MASK)} aria-hidden>
        <ul className="flex w-max animate-marquee will-change-transform motion-reduce:animate-none">
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

      {/* En pausa: una sola fila con scroll horizontal, del mismo alto que la cinta. */}
      <ul
        className={cn(
          "ticker-marquee-static flex-nowrap items-center gap-x-2 overflow-x-auto px-5 no-scrollbar",
          TAPE_ROW_HEIGHT,
          EDGE_MASK,
        )}
        aria-hidden
      >
        {quotes.map((quote) => (
          <li key={quote.symbol} className="flex shrink-0">
            <LandingPrice
              symbol={quote.symbol}
              initial={{ priceUsd: quote.priceUsd, change: quote.change }}
              layout="tape"
            />
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-6 w-full max-w-7xl space-y-1.5 px-5 text-center">
        <p className="text-sm leading-relaxed text-fg-body">
          Opera 24/7 con más de 400 acciones tokenizadas.
        </p>
        <p className="mx-auto max-w-2xl text-xs leading-relaxed text-fg-muted">{SCHEDULE_NOTE}</p>
      </div>

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
