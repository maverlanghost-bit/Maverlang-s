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

/** Fundido en los bordes: la cinta se apaga en vez de cortar un activo en seco. */
const EDGE_MASK =
  "[mask-image:linear-gradient(90deg,transparent_0,black_6%,black_94%,transparent_100%)]";

/** En pausa el contenido es un scroller: se apaga sólo el borde derecho (hay más). */
const EDGE_MASK_RIGHT = "[mask-image:linear-gradient(90deg,black_92%,transparent_100%)]";

/** Alto único de fila: la cinta mide lo mismo en marcha y en pausa. */
const TAPE_ROW_HEIGHT = "h-14";

/**
 * Copias del catálogo en la cinta. El bloque se desplaza -50 %, así que la
 * mitad debe cubrir el viewport más ancho: con dos copias, en pantallas
 * anchas se veía un hueco al cerrar el bucle. La duración crece con las
 * copias para mantener la misma velocidad (20 s por copia).
 */
const TAPE_COPIES = 6;
const TAPE_DURATION_S = 20 * TAPE_COPIES;

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
  // Sólo cotizaciones con precio: un US$0,00 en la cinta sería un dato falso.
  const rows = quotes.filter((quote) => Number.isFinite(quote.priceUsd) && quote.priceUsd > 0);
  const tape = Array.from({ length: TAPE_COPIES }, () => rows).flat();
  const [paused, setPaused] = useState(false);
  const { stale } = useLandingStatus();
  const label = !live ? "Precios ilustrativos" : stale ? "Precios sin actualizar" : "Precios en vivo";

  return (
    <section
      aria-label="Cinta de precios"
      className={cn("overflow-hidden border-y border-border py-6 md:py-8", paused && "ticker-marquee-paused")}
    >
      {/* Cabecera: rótulo y pausa en la misma línea, sin envolver. */}
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5">
        <p className="label min-w-0 truncate">{label}</p>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-[13px] leading-5 font-medium text-fg-muted underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-current"
        >
          {paused ? "Reanudar precios" : "Pausar precios"}
        </button>
      </div>

      <div
        className={cn("ticker-marquee-motion mt-2 flex items-center overflow-hidden", TAPE_ROW_HEIGHT, EDGE_MASK)}
        aria-hidden
      >
        <ul
          className="flex w-max animate-marquee will-change-transform motion-reduce:animate-none"
          style={{ animationDuration: `${TAPE_DURATION_S}s` }}
        >
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

      {/* En pausa: una sola fila con scroll horizontal, del mismo alto que la
          cinta. Sin máscara izquierda: al detenerse, el primer activo se lee
          completo; a la derecha queda el fundido de «hay más». */}
      <ul
        className={cn(
          "ticker-marquee-static mt-2 flex-nowrap items-center gap-x-2 overflow-x-auto overscroll-x-contain px-5 no-scrollbar",
          TAPE_ROW_HEIGHT,
          EDGE_MASK_RIGHT,
        )}
        aria-hidden
      >
        {rows.map((quote) => (
          <li key={quote.symbol} className="flex shrink-0">
            <LandingPrice
              symbol={quote.symbol}
              initial={{ priceUsd: quote.priceUsd, change: quote.change }}
              layout="tape"
            />
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-6 w-full max-w-7xl px-5">
        <p className="text-sm leading-relaxed text-fg">Opera 24/7 con más de 400 acciones tokenizadas.</p>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-muted">{SCHEDULE_NOTE}</p>
      </div>

      <p className="sr-only">{notice}</p>
      <ul className="sr-only">
        {rows.map((quote) => (
          <li key={quote.symbol}>
            {quote.name} ({quote.symbol}): {formatUsd(quote.priceUsd)}, {changeWord(quote.change)}{" "}
            {formatPercent(quote.change)}.
          </li>
        ))}
      </ul>
    </section>
  );
}
