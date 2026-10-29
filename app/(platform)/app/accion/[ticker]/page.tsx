import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { aboutForTicker } from "@/content/tickers";
import { readServerSession } from "@/lib/auth/server-session";
import { findAssetBySymbol, toTicker } from "@/lib/catalog/assets";
import { stockDescription } from "@/lib/seo/copy";
import { canonicalUrl } from "@/lib/seo/metadata";
import { resolvePublicAsset } from "@/lib/seo/public-catalog";
import { readSpotQuote } from "@/lib/services";

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
  // La ficha de la app sigue en noindex (layout de /app). El canonical apunta a la URL pública.
  const pub = await resolvePublicAsset(asset.symbol);
  const described = pub ?? {
    name: asset.name,
    ticker: asset.underlying || asset.symbol,
    etf: asset.category === "etf",
  };
  return {
    title: `${asset.name} (${asset.symbol})`,
    description: stockDescription(described),
    ...(pub
      ? { alternates: { canonical: canonicalUrl(`/acciones/${pub.slug}`) } }
      : {}),
  };
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
  // El precio corre en paralelo con el catálogo. Si no llega en 2,5 s, la ficha
  // igual pinta el nombre y el cliente completa el número.
  const quotePromise = readSpotQuote(raw);
  // M54c-fix: `hidden` se abre si el usuario tiene posición (la venta de lo
  // que ya se tiene siempre se permite). Sin posición, el cliente muestra el
  // mismo "no encontrado"; el mercado y la búsqueda no lo muestran (intacto).
  const asset =
    (await findAssetBySymbol(raw)) ??
    (await findAssetBySymbol(raw, { scope: "all", allowHidden: true, noListing: true }));
  if (!asset || !asset.mint) notFound();
  // Una ficha por empresa (M52b): el símbolo no elegido redirige a la ficha
  // elegida, nunca a un 404 roto.
  if (asset.symbol.toLowerCase() !== raw.trim().toLowerCase()) {
    redirect(`/app/accion/${asset.symbol}`);
  }
  const [session, spot] = await Promise.all([readServerSession(), quotePromise]);
  const initialQuote =
    spot && spot.symbol.toLowerCase() === asset.symbol.toLowerCase() ? spot : null;
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
      safetyStatus={asset.safetyStatus}
      initialQuote={initialQuote}
    />
  );
}
