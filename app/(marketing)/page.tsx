import { CostsSection } from "@/components/landing/costs-section";
import { FeatureGrid } from "@/components/landing/feature-grid";
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
    </main>
  );
}
