import { CostsSection } from "@/components/landing/costs-section";
import { FaqSection } from "@/components/landing/faq";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { FinalCTA } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFreshness, LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { ProductMock } from "@/components/landing/product-mock";
import { SecuritySection } from "@/components/landing/security-section";
import { TickerMarquee } from "@/components/landing/ticker-marquee";
import { getLandingQuotes } from "@/lib/landing/live-quotes";

/**
 * Portada con precios reales en dólares (M42): el servidor pide las quotes
 * una vez y los números se refrescan en cliente cada 20 s. Revalida cada
 * 30 s sin cambiar el estático del resto del marketing.
 */
export const revalidate = 30;

export default async function HomePage() {
  const { quotes, live, updatedAt } = await getLandingQuotes();
  const symbols = quotes.map((quote) => quote.symbol);

  return (
    <main>
      <LiveLandingPrices symbols={symbols} live={live} initial={quotes} updatedAt={updatedAt}>
        <Hero quotes={quotes} live={live} />
        <TickerMarquee quotes={quotes} live={live} />
        <LandingFreshness className="pb-6 md:pb-8" />
        <HowItWorks quotes={quotes} live={live} />
        <ProductMock quotes={quotes} live={live} />
      </LiveLandingPrices>
      <FeatureGrid />
      <CostsSection />
      <SecuritySection />
      <FaqSection />
      <FinalCTA />
    </main>
  );
}
