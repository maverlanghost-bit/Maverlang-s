import type { Metadata } from "next";

import { PortfolioScreen } from "./portfolio-screen";

export const metadata: Metadata = {
  title: "Cartera",
};

export default function CarteraPage() {
  return <PortfolioScreen />;
}
