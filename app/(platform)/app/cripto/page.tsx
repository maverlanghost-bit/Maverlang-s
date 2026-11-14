import type { Metadata } from "next";

import { CryptoMarket } from "@/components/domain/crypto-market";
import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { isCopyEnabled } from "@/lib/copy/flags";

export const metadata: Metadata = {
  title: "Cripto",
  description:
    "Cripto, dólares y oro tokenizados en Solana: sellos, origen y precio de mercado. Modo demo, sin custodia.",
  // /app ya es noindex (layout del grupo); se repite para no depender de otro archivo.
  robots: { index: false, follow: false },
};

export default async function CriptoPage() {
  const showCopy = await isCopyEnabled();
  return <CryptoMarket sections={<MarketSectionChips active="crypto" showCopy={showCopy} />} />;
}
