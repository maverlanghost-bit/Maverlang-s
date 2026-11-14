import type { Metadata } from "next";

import { EarnScreen } from "@/components/domain/earn-screen";
import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { isCopyEnabled } from "@/lib/copy/flags";

export const metadata: Metadata = {
  title: "Ganar",
  description:
    "Tokens de staking de Solana y USDY en modo demo. APY publicado por el emisor o «sin dato»; el valor de la posición sigue el precio vivo.",
  robots: { index: false, follow: false },
};

export default async function GanarPage() {
  const showCopy = await isCopyEnabled();
  return <EarnScreen sections={<MarketSectionChips active="crypto" showCopy={showCopy} />} />;
}
