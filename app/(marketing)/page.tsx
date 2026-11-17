import { CostsSection } from "@/components/landing/costs-section";
import { FaqSection } from "@/components/landing/faq";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { FinalCTA } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HoursBand } from "@/components/landing/hours-band";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { SecuritySection } from "@/components/landing/security-section";
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
 * T70 — ocho bloques, ninguno repite la composición del anterior:
 * hero con bento de producto → cinta → pasos (dividido) → por qué (bento
 * sobre gris) → banda 24/7 (negro) → costos (dividido) → qué tienes y qué no
 * → preguntas y cierre. La ficha suelta «Mira una acción de cerca» pasó a ser
 * una tarjeta del bento del hero.
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
        <HowItWorks quotes={quotes} live={live} />
      </LiveLandingPrices>
      <FeatureGrid />
      <HoursBand />
      <CostsSection />
      <SecuritySection />
      <FaqSection />
      <FinalCTA />
    </>
  );
}
