import type { Metadata } from "next";

import { LegalScreen } from "./legal-screen";

export const metadata: Metadata = {
  title: "Documentos legales",
};

export default function LegalPage() {
  return <LegalScreen />;
}
