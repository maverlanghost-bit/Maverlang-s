import { FractionCalculator } from "@/components/landing/fraction-calculator";
import { Reveal } from "@/components/landing/reveal";
import { LandingSection } from "@/components/landing/section";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
import { HERO_SYMBOLS, type LandingQuote } from "@/lib/mocks/landing";

/**
 * "No necesitas una acción entera" (T90): la idea de fracción explicada con
 * una cuenta que el visitante mueve, en vez de un párrafo. Composición
 * dividida, al revés que el hero: la pieza interactiva a la derecha en
 * escritorio, debajo del texto en celular.
 */
export function FractionSection({ quotes }: { quotes: LandingQuote[] }) {
  const priced = quotes.filter((quote) => Number.isFinite(quote.priceUsd) && quote.priceUsd > 0);
  const picks = priced.filter((quote) => HERO_SYMBOLS.has(quote.symbol));
  const shown = (picks.length > 0 ? picks : priced).slice(0, 4);

  return (
    <LandingSection id="fracciones" titleId="fracciones-title">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal>
          <h2 id="fracciones-title" className="max-w-[14ch] text-title text-balance">
            No necesitas una acción entera.
          </h2>
          <p className="mt-5 max-w-[30rem] text-pretty text-lead text-fg-body">
            Con US${LANDING_MIN_ORDER_USD} ya compras una parte. Elige una acción y un monto: te mostramos cuánto
            recibes al precio de ahora.
          </p>
        </Reveal>
        <Reveal delay={80}>
          <FractionCalculator quotes={shown} minUsd={LANDING_MIN_ORDER_USD} />
        </Reveal>
      </div>
    </LandingSection>
  );
}
