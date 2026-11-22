import { AlwaysOpenBand } from "@/components/landing/always-open-band";
import { CostsStrip } from "@/components/landing/costs-strip";
import { FaqSection } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { FractionSection } from "@/components/landing/fraction-section";
import { Hero } from "@/components/landing/hero";
import { LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { OwnershipSection } from "@/components/landing/ownership-section";
import { TickerMarquee } from "@/components/landing/ticker-marquee";
import { getLandingQuotes } from "@/lib/landing/live-quotes";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo/copy";
import { JsonLd, organizationJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * Portada con precios reales en dólares (M42): el servidor pide las quotes
 * una vez y los números se refrescan en cliente cada 20 s. Revalida cada
 * 30 s sin cambiar el estático del resto del marketing.
 *
 * T90 (docs/PLAN-PORTADA-V2.md): hero con el teléfono de la demo en bucle →
 * cinta → calculadora de fracciones → banda negra 24/7 → qué tienes y qué no →
 * costos en una franja → preguntas y cierre. "Seis reglas" y "Tres pasos"
 * salieron de la portada (los pasos siguen en /como-funciona).
 */
export const revalidate = 30;

export const metadata = pageMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
  absolute: true,
});

export default async function HomePage() {
  const { quotes, live } = await getLandingQuotes();
  const symbols = quotes.map((quote) => quote.symbol);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <LiveLandingPrices symbols={symbols} live={live} initial={quotes}>
        <Hero quotes={quotes} live={live} />
        <TickerMarquee quotes={quotes} live={live} />
        <FractionSection quotes={quotes} />
      </LiveLandingPrices>
      <AlwaysOpenBand />
      <OwnershipSection />
      <CostsStrip />
      <FaqSection />
      <FinalCTA />
    </>
  );
}
