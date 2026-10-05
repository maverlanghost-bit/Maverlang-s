import { CostsSection } from "@/components/landing/costs-section";
import { FaqSection } from "@/components/landing/faq";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { FinalCTA } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ProductMock } from "@/components/landing/product-mock";
import { SecuritySection } from "@/components/landing/security-section";
import { TickerMarquee } from "@/components/landing/ticker-marquee";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <TickerMarquee />
      <HowItWorks />
      <ProductMock />
      <FeatureGrid />
      <CostsSection />
      <SecuritySection />
      <FaqSection />
      <FinalCTA />
    </main>
  );
}
