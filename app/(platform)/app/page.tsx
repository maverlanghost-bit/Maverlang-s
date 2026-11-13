import type { Metadata } from "next";

import { MarketSectionChips } from "@/components/domain/market-section-chips";

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
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <MarketSectionChips active="stocks" />
      <MarketScreen initialFilter={one(params.filtro)} initialSort={one(params.orden)} />
    </div>
  );
}
