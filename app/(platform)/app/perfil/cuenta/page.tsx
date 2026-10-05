import type { Metadata } from "next";

import { AccountScreen } from "./account-screen";

export const metadata: Metadata = {
  title: "Cuenta",
};

export default function CuentaPage() {
  return <AccountScreen />;
}
