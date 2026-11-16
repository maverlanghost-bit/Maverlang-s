import type { Metadata } from "next";

import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { ScreenerScreen } from "@/components/market/screener-screen";
import { isCopyEnabled } from "@/lib/copy/flags";

export const metadata: Metadata = {
  title: "Screener",
  robots: { index: false, follow: false },
};

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) search.set(key, first);
  }
  const showCopy = await isCopyEnabled();
  return <ScreenerScreen initialSearch={search.toString()} sections={<MarketSectionChips active="screener" showCopy={showCopy} />} />;
}
