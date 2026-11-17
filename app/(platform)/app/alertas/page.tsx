import type { Metadata } from "next";

import { AlertsCenterScreen } from "@/components/domain/alerts-center-screen";
import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { isCopyEnabled } from "@/lib/copy/flags";

export const metadata: Metadata = {
  title: "Alertas de precio",
  robots: { index: false, follow: false },
};

export default async function AlertasPage() {
  const showCopy = await isCopyEnabled();
  return <AlertsCenterScreen sections={<MarketSectionChips active="alerts" showCopy={showCopy} />} />;
}
