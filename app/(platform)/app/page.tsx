import type { Metadata } from "next";

import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { isCopyEnabled } from "@/lib/copy/flags";

import { MarketScreen } from "./market-screen";

export const metadata: Metadata = {
  title: "Mercado",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showCopy = await isCopyEnabled();
  // Las secciones del mercado (Acciones · Cripto · Ganar · Copiar) son
  // subnavegación del encabezado: van dentro de la pantalla, bajo el H1.
  return (
    <MarketScreen
      initialFilter={one(params.filtro)}
      initialSort={one(params.orden)}
      sections={<MarketSectionChips active="stocks" showCopy={showCopy} />}
    />
  );
}
