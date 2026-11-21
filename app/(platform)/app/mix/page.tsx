import type { Metadata } from "next";

import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { MixBuilderScreen } from "@/components/domain/mix-builder-screen";
import { isCopyEnabled } from "@/lib/copy/flags";

export const metadata: Metadata = {
  title: "Armar Mix",
  robots: { index: false, follow: false },
};

export default async function MixPage() {
  const showCopy = await isCopyEnabled();
  return <MixBuilderScreen sections={<MarketSectionChips active="mix" showCopy={showCopy} />} />;
}
