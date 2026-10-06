import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { LandingQuotePreview } from "@/components/landing/landing-quote-preview";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { landingNotice } from "@/lib/landing/live-quotes";
import { ILLUSTRATIVE_NOTICE, type LandingQuote } from "@/lib/mocks/landing";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/**
 * Ficha de ejemplo sin serie (M42): el historial live no es real, así
 * que cada pestaña muestra sólo precio en dólares (US$) y cambio 24 h, en
 * vivo cuando la fuente responde.
 */
export function ProductMock({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const first = quotes[0];

  return (
    <LandingSection titleId="elige-title">
      <Reveal>
        <SectionIntro id="elige-title" label="04 — Elige tu acción" title="Mira una acción de cerca">
          {live
            ? `Cada pestaña sigue el precio del catálogo. ${landingNotice(true)}.`
            : `Cada pestaña es un ejemplo del catálogo. ${ILLUSTRATIVE_NOTICE}: no son cotizaciones.`}
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 md:mt-14">
        <Card>
          {first ? (
            <Tabs
              label="Acciones de ejemplo"
              defaultValue={first.symbol}
              tabs={quotes.map((quote) => ({
                value: quote.symbol,
                label: quote.underlying,
                content: <LandingQuotePreview quote={quote} />,
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
