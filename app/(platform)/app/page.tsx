import type { Metadata } from "next";

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
  return <MarketScreen initialQuery={one(params.q)} initialFilter={one(params.filtro)} initialSort={one(params.orden)} />;
}
