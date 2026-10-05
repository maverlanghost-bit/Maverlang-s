import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { ILLUSTRATIVE_NOTICE, landingQuotes, type LandingQuote } from "@/lib/mocks/landing";

const tape = [...landingQuotes, ...landingQuotes];

function changeWord(change: number) {
  if (change > 0) return "sube";
  if (change < 0) return "baja";
  return "sin cambio";
}

function QuoteItem({ quote }: { quote: LandingQuote }) {
  const tone = quote.change > 0 ? "text-up" : quote.change < 0 ? "text-down" : "text-fg-muted";

  return (
    <span className="inline-flex items-center gap-2 px-4">
      <span className="text-sm font-medium text-fg">{quote.symbol}</span>
      <span className={cn("font-mono text-sm tabular-nums", tone)}>{formatPercent(quote.change)}</span>
    </span>
  );
}

export function TickerMarquee() {
  return (
    <section aria-labelledby="cinta-label" className="overflow-hidden border-y border-border py-6 md:py-8">
      <h2 id="cinta-label" className="label mb-4 text-center">
        02 — Variación ilustrativa
      </h2>

      <div className="ticker-marquee-motion" aria-hidden>
        <ul className="flex w-max animate-marquee">
          {tape.map((quote, index) => (
            <li key={`${quote.symbol}-${index}`} className="flex">
              <QuoteItem quote={quote} />
            </li>
          ))}
        </ul>
      </div>

      <ul className="ticker-marquee-static flex-wrap justify-center gap-x-2 gap-y-2 px-5" aria-hidden>
        {landingQuotes.map((quote) => (
          <li key={quote.symbol}>
            <QuoteItem quote={quote} />
          </li>
        ))}
      </ul>

      <p className="sr-only">{ILLUSTRATIVE_NOTICE}. No son cotizaciones en vivo.</p>
      <ul className="sr-only">
        {landingQuotes.map((quote) => (
          <li key={quote.symbol}>
            {quote.name} ({quote.symbol}): {changeWord(quote.change)} {formatPercent(quote.change)}.
          </li>
        ))}
      </ul>
    </section>
  );
}
