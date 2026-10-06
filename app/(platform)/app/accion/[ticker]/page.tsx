import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { aboutForTicker } from "@/content/tickers";
import { readServerSession } from "@/lib/auth/server-session";
import { tradableTicker } from "@/lib/solana/allowlist";

import { DetailScreen, type DetailAccess } from "./detail-screen";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const found = tradableTicker(ticker);
  if (!found) return { title: "Acción no encontrada" };
  return { title: `${found.name} (${found.symbol})` };
}

export default async function AccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ticker: raw } = await params;
  const query = await searchParams;
  const ticker = tradableTicker(raw);
  if (!ticker) notFound();
  const session = await readServerSession();
  const access: DetailAccess = !session.hasSession ? "guest" : session.onboarded ? "member" : "pending";

  return (
    <DetailScreen
      ticker={ticker}
      about={aboutForTicker(ticker.symbol)}
      initialOperar={one(query.operar)}
      access={access}
    />
  );
}
