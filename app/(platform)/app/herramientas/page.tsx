import type { Metadata } from "next";

import { ToolsScreen } from "@/components/domain/tools-screen";

export const metadata: Metadata = {
  title: "Herramientas",
  robots: { index: false, follow: false },
};

export default function ToolsPage() {
  return <ToolsScreen />;
}
