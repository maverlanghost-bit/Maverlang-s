import type { Metadata } from "next";

import { LanguageScreen } from "./language-screen";

export const metadata: Metadata = {
  title: "Idioma",
};

export default function IdiomaPage() {
  return <LanguageScreen />;
}
