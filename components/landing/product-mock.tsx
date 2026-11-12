import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { LandingQuotePreview } from "@/components/landing/landing-quote-preview";
import type { LandingQuote } from "@/lib/mocks/landing";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/**
 * Una sola ficha de producto: la acción de referencia del catálogo, con su
 * precio, su variación y el historial del período. Sin pestañas ni controles
 * de demostración: los datos son los que ya recibe la portada.
 */
export function ProductMock({ quotes, live }: { quotes: LandingQuote[]; live: boolean }) {
  const quote = quotes.find((item) => item.symbol === "AAPLx") ?? quotes[0];

  return (
    <LandingSection titleId="elige-title">
      <Reveal>
        <SectionIntro id="elige-title" title="Mira una acción de cerca">
          {live
            ? "Precio en dólares y variación de 24 h, con el historial del período."
            : "Precio en dólares de muestra. Los valores son ilustrativos, no cotizaciones."}
        </SectionIntro>
      </Reveal>
      <Reveal delay={REVEAL_STAGGER_MS} className="mt-10 md:mt-14">
        {quote ? (
          <LandingQuotePreview quote={quote} live={live} />
        ) : (
          <p className="text-sm text-fg-muted">No hay acciones de ejemplo.</p>
        )}
      </Reveal>
    </LandingSection>
  );
}
