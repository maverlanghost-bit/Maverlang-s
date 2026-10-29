import type { Metadata } from "next";

import { FavoritasScreen } from "./favoritas-screen";

export const metadata: Metadata = {
  title: "Favoritas",
};

export default function FavoritasPage() {
  return <FavoritasScreen />;
}
