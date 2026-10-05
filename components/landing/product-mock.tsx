import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceText } from "@/components/domain/price-text";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { ILLUSTRATIVE_NOTICE, landingQuotes, type LandingQuote } from "@/lib/mocks/landing";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

function QuotePreview({ quote }: { quote: LandingQuote }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TickerLogo symbol={quote.symbol} name={quote.name} size={48} decorative />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-fg">{quote.name}</p>
            <p className="truncate text-sm text-fg-muted">{quote.underlying}</p>
          </div>
        </div>
        <ChangeBadge value={quote.change} />
      </div>
      <PriceText value={quote.priceUsd} currency="USD" size="lg" />
      <Sparkline
        data={quote.sparkline}
        width={640}
        height={160}
        label={`Variación ilustrativa de ${quote.name}`}
        className="h-auto w-full"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={buttonClasses({ size: "md", className: "pointer-events-none min-h-11" })} aria-hidden>
          Comprar
        </span>
        <p className="text-sm text-fg-muted">Botón de ejemplo. No envía una orden.</p>
      </div>
    </div>
  );
}

export function ProductMock() {
  const first = landingQuotes[0];

  return (
    <LandingSection titleId="elige-title">
      <Reveal>
        <SectionIntro id="elige-title" label="04 — Elige tu acción" title="Mira una acción de cerca">
          Cada pestaña es un ejemplo del catálogo. {ILLUSTRATIVE_NOTICE}: no son cotizaciones.
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 md:mt-14">
        <Card>
          {first ? (
            <Tabs
              label="Acciones de ejemplo"
              defaultValue={first.symbol}
              tabs={landingQuotes.map((quote) => ({
                value: quote.symbol,
                label: quote.underlying,
                content: <QuotePreview quote={quote} />,
              }))}
            />
          ) : (
            <p className="text-sm text-fg-muted">No hay acciones de ejemplo.</p>
          )}
        </Card>
      </Reveal>
    </LandingSection>
  );
}
