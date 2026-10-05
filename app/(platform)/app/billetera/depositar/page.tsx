import type { Metadata } from "next";

import { DepositScreen } from "./deposit-screen";

export const metadata: Metadata = {
  title: "Depositar",
};

export default function DepositarPage() {
  return <DepositScreen />;
}
