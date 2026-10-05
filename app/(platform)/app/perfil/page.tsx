import type { Metadata } from "next";

import { SectionBody } from "@/components/app-shell/section-body";

export const metadata: Metadata = {
  title: "Perfil",
};

export default function PerfilPage() {
  return <SectionBody section="profile" />;
}
