import type { Metadata } from "next";

import { CompareProScreen } from "@/components/charts/compare-screen";
import { isDetailRange } from "@/lib/market/series";
import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { isCopyEnabled } from "@/lib/copy/flags";

export const metadata: Metadata = {
  title: "Comparar activos",
  robots: { index: false, follow: false },
};

function parseActivos(raw: string | string[] | undefined): string[] {
  const text = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  if (!text.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const sym = part.trim();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= 4) break;
  }
  return out;
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, showCopy] = await Promise.all([searchParams, isCopyEnabled()]);
  const initialSymbols = parseActivos(params.activos);
  const rawRange = typeof params.rango === "string" ? params.rango : "1M";

  return (
    <CompareProScreen
      initialSymbols={initialSymbols}
      initialRange={isDetailRange(rawRange) ? rawRange : "1M"}
      sections={<MarketSectionChips active="compare" showCopy={showCopy} />}
    />
  );
}
