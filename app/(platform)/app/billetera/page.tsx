import type { Metadata } from "next";

import { SectionBody } from "@/components/app-shell/section-body";

export const metadata: Metadata = {
  title: "Billetera",
};

export default function BilleteraPage() {
  return <SectionBody section="wallet" />;
}
