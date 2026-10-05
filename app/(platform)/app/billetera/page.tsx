import type { Metadata } from "next";

import { WalletScreen } from "./wallet-screen";

export const metadata: Metadata = {
  title: "Billetera",
};

export default function BilleteraPage() {
  return <WalletScreen />;
}
