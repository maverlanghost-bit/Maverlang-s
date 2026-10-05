import type { Metadata } from "next";

import { SectionBody } from "@/components/app-shell/section-body";

export const metadata: Metadata = {
  title: "Mercado",
};

export default function MercadoPage() {
  return <SectionBody section="market" />;
}
