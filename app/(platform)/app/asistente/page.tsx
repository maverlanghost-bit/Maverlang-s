import type { Metadata } from "next";

import { AsistenteScreen } from "./asistente-screen";

export const metadata: Metadata = {
  title: "Asistente",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AsistentePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = one(params.q);
  const ticker = one(params.ticker);
  return <AsistenteScreen key={`${query}\n${ticker}`} initialQuery={query} initialTicker={ticker} />;
}
