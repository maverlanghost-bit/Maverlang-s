import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ShareCardButton } from "@/components/domain/share-card-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection } from "@/components/landing/section";
import {
  StockAboutSections,
  StockDataList,
  StockExploreSection,
  StockFaqSection,
  StockLegalNotes,
  StockSimilarSection,
} from "@/components/landing/stock-rich-sections";
import { StockLivePrice } from "@/components/landing/stock-live-price";
import { buttonClasses } from "@/components/ui/button";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { companyProfile } from "@/lib/seo/company-profile";
import { stockDescription, stockTitle } from "@/lib/seo/copy";
import { breadcrumbJsonLd, financialProductJsonLd, JsonLd, simpleFaqJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, resolvePublicAsset } from "@/lib/seo/public-catalog";
import { stockFaq } from "@/lib/seo/stock-copy";

export const revalidate = 3600;
/** Un slug desconocido entra a la página y muestra el 404 con H1, dentro del layout. */
export const dynamicParams = true;

/** CTA primaria de la ficha: una sola en toda la página (el hero). */
const primaryCtaClass = buttonClasses({ variant: "primary", size: "lg" });

/** Especificaciones técnicas del instrumento: mismo contenido de siempre. */
function specRows(asset: { symbol: string; ticker: string; etf: boolean }) {
  return [
    { label: "Símbolo en plataforma", value: asset.symbol, mono: true },
    { label: "Subyacente en EE.UU.", value: asset.ticker, mono: true },
    {
      label: "Tipo de instrumento",
      value: asset.etf ? "ETF tokenizado (1:1)" : "Acción tokenizada (1:1)",
      mono: false,
    },
    { label: "Emisor del token", value: "Backed Finance (xStocks)", mono: false },
    { label: "Red y custodia", value: "Solana Mainnet (SPL) · Autocustodia", mono: false },
    { label: "Horario de operación", value: "24/7 en plataforma", mono: false },
  ];
}

export async function generateStaticParams() {
  const assets = await listPublicAssets();
  return assets.map((asset) => ({ slug: asset.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const asset = await resolvePublicAsset(slug);
  if (!asset) {
    return pageMetadata({
      title: "Página no encontrada",
      description: "La dirección no existe o cambió.",
      path: `/acciones/${slug}`,
      index: false,
      follow: false,
    });
  }
  return pageMetadata({
    title: stockTitle(asset),
    description: stockDescription(asset),
    path: `/acciones/${asset.slug}`,
    absolute: true,
  });
}

export default async function AccionPublicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const asset = await resolvePublicAsset(slug);
  if (!asset) notFound();
  if (asset.slug !== slug.trim().toLowerCase()) {
    permanentRedirect(`/acciones/${asset.slug}`);
  }

  const assets = await listPublicAssets();
  const profile = companyProfile(asset.ticker);
  const faq = stockFaq(asset, profile);
  const description = stockDescription(asset);
  const kind = asset.etf ? "ETF EE.UU." : "Acción EE.UU.";
  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Acciones", path: "/acciones" },
    { name: asset.name, path: `/acciones/${asset.slug}` },
  ];

  return (
    <LandingSection titleId="accion-title" density="compact">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd
        data={financialProductJsonLd({
          name: asset.name,
          ticker: asset.ticker,
          slug: asset.slug,
          description,
          etf: asset.etf,
        })}
      />
      {faq.length > 0 ? <JsonLd data={simpleFaqJsonLd(faq)} /> : null}
      <article>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Migas" className="text-[13px] text-fg-muted">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li>
                <Link href="/" className="underline decoration-border underline-offset-4 hover:decoration-fg">
                  Inicio
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/acciones" className="underline decoration-border underline-offset-4 hover:decoration-fg">
                  Acciones
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-fg">
                {asset.name}
              </li>
            </ol>
          </nav>
          <ShareCardButton id={asset.slug} name={asset.name} className="ml-auto shrink-0" />
        </div>

        {/* Ficha de producto: identidad, precio y la única CTA primaria, antes de cualquier texto. */}
        <header className="mt-6 border-b border-border pb-8 md:pb-10">
          <div className="flex items-start gap-4">
            <TickerLogo
              symbol={asset.symbol}
              name={asset.name}
              logoUrl={logoPathFromSymbol(asset.symbol)}
              size={64}
              loading="eager"
              sizes="64px"
            />
            <div className="min-w-0">
              <p className="label">{asset.ticker} · {kind}</p>
              <h1 id="accion-title" className="mt-2 text-3xl break-words text-balance sm:text-4xl md:text-5xl">
                {asset.name}
              </h1>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="label">Precio del token · US$</p>
              <div className="mt-2">
                <StockLivePrice symbol={asset.symbol} size="lg" showStatus />
              </div>
            </div>
            <Link
              href={`/app/accion/${asset.symbol}`}
              aria-label={`Operar ${asset.name} (${asset.ticker}) en la demo con saldo ficticio`}
              className={cn(primaryCtaClass, "w-full shrink-0 sm:w-auto")}
            >
              Operar en la demo
            </Link>
          </div>
        </header>

        <div className="mt-10 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-12">
          <div className="order-2 min-w-0 lg:order-1">
            <StockAboutSections asset={asset} profile={profile} />

            <section aria-labelledby="accion-especificaciones" className="mt-10 border-t border-border pt-8">
              <h2 id="accion-especificaciones" className="text-2xl sm:text-3xl">
                Especificaciones
              </h2>
              <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-fg-muted">
                Datos del instrumento tal como se muestran en la plataforma.
              </p>
              <StockDataList rows={specRows(asset)} className="mt-5 max-w-3xl" />
            </section>
          </div>

          {/* Panel de operación: primero en móvil y sticky en escritorio. El precio
              y la CTA viven en el hero, así que acá no se repiten. */}
          <aside className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-24">
            <div className="border-y border-border">
              <h2 className="label border-b border-border px-5 py-3.5">Resumen de operación</h2>
              <div className="px-5 pb-5 pt-2">
                <dl className="divide-y divide-border border-b border-border">
                  <div className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <dt className="text-fg-muted">Comisión plataforma</dt>
                    <dd className="shrink-0 font-medium text-fg">
                      <span className="num">0%</span>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <dt className="text-fg-muted">Mínimo por orden</dt>
                    <dd className="shrink-0 font-medium text-fg">
                      <span className="num">US$10</span>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <dt className="text-fg-muted">Modo demo</dt>
                    <dd className="text-right font-medium text-fg">
                      <span className="num">US$10.000</span> virtuales
                    </dd>
                  </div>
                </dl>

                <Link
                  href="/acciones"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                >
                  Ver todo el catálogo <span aria-hidden="true">→</span>
                </Link>

                <p className="mt-4 text-xs leading-relaxed text-fg-muted">
                  El saldo de la demo es ficticio. Fuera del horario regular de la bolsa de EE.UU. el precio puede
                  variar más.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <StockFaqSection items={faq} />
        <StockSimilarSection asset={asset} assets={assets} />
        <StockExploreSection asset={asset} assets={assets} />
        <StockLegalNotes asset={asset} />
      </article>
    </LandingSection>
  );
}
