import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { LandingQuotePreview } from "@/components/landing/landing-quote-preview";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { landingNotice } from "@/lib/landing/live-quotes";
import { ILLUSTRATIVE_NOTICE, type LandingQuote } from "@/lib/mocks/landing";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/**
 * Ficha de ejemplo (M42): cada pestaña sigue el precio del catálogo y su
 * historial del período, en vivo cuando la fuente responde. La etiqueta de
 * precios la decide `live`; el gráfico cae a una curva de referencia si el
 * historial no trae puntos.
 */
export function ProductMock({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const first = quotes[0];

  return (
    <LandingSection titleId="elige-title">
      <Reveal>
        <SectionIntro id="elige-title" title="Mira una acción de cerca">
          {live
            ? `Cada pestaña sigue el precio del catálogo. ${landingNotice(true)}.`
            : `Cada pestaña es un ejemplo del catálogo. ${ILLUSTRATIVE_NOTICE}: no son cotizaciones.`}
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 md:mt-14">
        <Card className="p-5 sm:p-7">
          {/* El tablist de `Tabs` es un carrusel: sin barra visible y con
              degradado en los bordes para que se note que hay más activos. */}
          {first ? (
            <div className="[&_[role=tablist]]:no-scrollbar [&_[role=tablist]]:[mask-image:linear-gradient(90deg,transparent,#000_2%,#000_98%,transparent)]">
              <Tabs
                label="Acciones de ejemplo"
                defaultValue={first.symbol}
                tabs={quotes.map((quote) => ({
                  value: quote.symbol,
                  label: quote.underlying,
                  content: <LandingQuotePreview quote={quote} />,
                }))}
              />
            </div>
          ) : (
            <p className="text-sm text-fg-muted">No hay acciones de ejemplo.</p>
          )}
        </Card>
      </Reveal>
    </LandingSection>
  );
}
