import type { Metadata } from "next";

import { SecurityScreen } from "./security-screen";

export const metadata: Metadata = {
  title: "Seguridad",
};

export default function SeguridadPage() {
  return <SecurityScreen />;
}
