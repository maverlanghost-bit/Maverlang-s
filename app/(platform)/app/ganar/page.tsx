import type { Metadata } from "next";

import { EarnScreen } from "@/components/domain/earn-screen";

export const metadata: Metadata = {
  title: "Ganar",
  description:
    "Tokens de staking de Solana y USDY en modo demo. APY publicado por el emisor o «sin dato»; el valor de la posición sigue el precio vivo.",
  robots: { index: false, follow: false },
};

export default function GanarPage() {
  return <EarnScreen />;
}
