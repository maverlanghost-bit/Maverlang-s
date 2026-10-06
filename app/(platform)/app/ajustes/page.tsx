import type { Metadata } from "next";

import { SettingsScreen } from "./settings-screen";

export const metadata: Metadata = {
  title: "Ajustes",
};

export default function AjustesPage() {
  return <SettingsScreen />;
}
