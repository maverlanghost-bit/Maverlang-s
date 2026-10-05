import type { Metadata } from "next";

import { SectionBody } from "@/components/app-shell/section-body";

export const metadata: Metadata = {
  title: "Cartera",
};

export default function CarteraPage() {
  return <SectionBody section="portfolio" />;
}
