import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { aboutForTicker } from "@/content/tickers";
import { readServerSession } from "@/lib/auth/server-session";
import { findAssetBySymbol, toTicker } from "@/lib/catalog/assets";

import { DetailScreen, type DetailAccess, type TradeBlock } from "./detail-screen";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Cualquier símbolo del catálogo dentro del alcance (curados por defecto). Sin mint, 404. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const asset = await findAssetBySymbol(ticker);
  if (!asset || !asset.mint) return { title: "Acción no encontrada" };
  return { title: `${asset.name} (${asset.symbol})` };
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
  const asset = await findAssetBySymbol(raw);
  // `hidden` no aparece (M54): misma página de "no encontrado" actual.
  if (!asset || !asset.mint || asset.safetyStatus === "hidden") notFound();
  // Una ficha por empresa (M52b): el símbolo no elegido redirige a la ficha
  // elegida, nunca a un 404 roto.
  if (asset.symbol.toLowerCase() !== raw.trim().toLowerCase()) {
    redirect(`/app/accion/${asset.symbol}`);
  }
  const session = await readServerSession();
  const access: DetailAccess = !session.hasSession ? "guest" : session.demoReady ? "member" : "pending";

  // Operar sólo si está habilitada, no suspendida y `tradable` (M54: sólo
  // `listed`, con transición). Si no, CTA deshabilitado con motivo.
  const tradeBlock: TradeBlock = !asset.enabled
    ? "disabled"
    : asset.halted
      ? "halted"
      : !asset.tradable
        ? "review"
        : null;

  return (
    <DetailScreen
      ticker={toTicker(asset)}
      about={aboutForTicker(asset.symbol)}
      initialOperar={one(query.operar)}
      access={access}
      tradeBlock={tradeBlock}
    />
  );
}
