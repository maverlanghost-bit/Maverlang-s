import { LandingPrice } from "@/components/landing/live-landing-prices";
import { formatPercent } from "@/lib/format";
import { landingNotice } from "@/lib/landing/live-quotes";
import { ILLUSTRATIVE_NOTICE, type LandingQuote } from "@/lib/mocks/landing";

function changeWord(change: number) {
  if (change > 0) return "sube";
  if (change < 0) return "baja";
  return "sin cambio";
}

/**
 * Cinta con precio en dólares (US$) y variación (M42). Los números son
 * cliente (`<LandingPrice>` liviano). La línea de abajo nombra el catálogo;
 * no es un contador de frescura.
 */
export function TickerMarquee({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const tape = [...quotes, ...quotes];

  return (
    <section aria-label="Cinta de precios" className="overflow-hidden border-y border-border py-6 md:py-8">
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

      <p className="sr-only">
        {live ? `${landingNotice(true)}.` : `${ILLUSTRATIVE_NOTICE}. No son cotizaciones en vivo.`}
      </p>
      <ul className="sr-only">
        {quotes.map((quote) => (
          <li key={quote.symbol}>
            {quote.name} ({quote.symbol}): {changeWord(quote.change)} {formatPercent(quote.change)}.
          </li>
        ))}
      </ul>
    </section>
  );
}
