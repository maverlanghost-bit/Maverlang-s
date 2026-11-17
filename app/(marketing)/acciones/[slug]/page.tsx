import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ShareCardButton } from "@/components/domain/share-card-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { CatalogBody } from "@/components/landing/catalog-body";
import { CatalogBreadcrumb } from "@/components/landing/catalog-breadcrumb";
import { PageHero } from "@/components/landing/page-hero";
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
import { stockFacts, stockFaq } from "@/lib/seo/stock-copy";

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

/** Anclas de la ficha: sólo las secciones que existen en esta página. */
function sectionLinks(hasFacts: boolean, hasFaq: boolean) {
  return [
    { href: "#accion-sobre", label: "Sobre" },
    ...(hasFacts ? [{ href: "#accion-datos-empresa", label: "Datos" }] : []),
    { href: "#accion-especificaciones", label: "Especificaciones" },
    ...(hasFaq ? [{ href: "#accion-preguntas", label: "Preguntas" }] : []),
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
  const hasFacts = stockFacts(asset, profile).length > 0;
  const description = stockDescription(asset);
  const kind = asset.etf ? "ETF EE.UU." : "Acción EE.UU.";
  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Acciones", path: "/acciones" },
    { name: asset.name, path: `/acciones/${asset.slug}` },
  ];
  const links = sectionLinks(hasFacts, faq.length > 0);
  const operateLabel = `Operar ${asset.name} (${asset.ticker}) en la demo con saldo ficticio`;

  return (
    <>
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

      {/* Ficha de producto: identidad, precio y la única CTA primaria, antes de cualquier texto. */}
      <PageHero
        titleId="accion-title"
        breadcrumb={
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0">
            <CatalogBreadcrumb
              items={[{ name: "Inicio", href: "/" }, { name: "Acciones", href: "/acciones" }, { name: asset.name }]}
            />
            <ShareCardButton id={asset.slug} name={asset.name} className="ml-auto shrink-0" />
          </div>
        }
        eyebrow={`${asset.ticker} · ${kind}`}
        title={asset.name}
        factsLabel="Datos del token"
        facts={[
          <span key="symbol" className="num">
            {asset.symbol}
          </span>,
          <span key="type">{asset.etf ? "ETF tokenizado (1:1)" : "Acción tokenizada (1:1)"}</span>,
          <span key="network">Solana (SPL)</span>,
          <span key="hours">24/7 en plataforma</span>,
        ]}
        actions={
          <Link
            href={`/app/accion/${asset.symbol}`}
            aria-label={operateLabel}
            className={cn(primaryCtaClass, "w-full sm:w-auto")}
          >
            Operar en la demo
          </Link>
        }
        aside={
          <div className="rounded-bento border border-border bg-surface-1 p-6 md:p-8">
            <div className="flex items-center gap-4">
              <TickerLogo
                symbol={asset.symbol}
                name={asset.name}
                logoUrl={logoPathFromSymbol(asset.symbol)}
                size={64}
                loading="eager"
                sizes="64px"
              />
              <p className="label">Precio del token · US$</p>
            </div>
            <div className="mt-8">
              <StockLivePrice symbol={asset.symbol} size="lg" showStatus />
            </div>
          </div>
        }
      />

      {/* Subnavegación fija bajo el header: sólo anclas a secciones reales de esta página. */}
      <nav
        aria-label="Secciones de la ficha"
        className="sticky top-16 z-20 border-b border-border bg-bg/95 px-5 backdrop-blur-sm"
      >
        <ul className="no-scrollbar mx-auto flex w-full max-w-6xl items-center gap-6 overflow-x-auto overscroll-x-contain">
          {links.map((link) => (
            <li key={link.href} className="shrink-0">
              <a
                href={link.href}
                className="inline-flex min-h-11 items-center border-b-2 border-transparent px-0.5 pt-0.5 text-[13px] font-medium text-fg-muted transition-colors duration-150 ease-spring hover:border-border-strong hover:text-fg"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <CatalogBody>
        <article>
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-12">
            <div className="order-2 min-w-0 lg:order-1">
              <StockAboutSections asset={asset} profile={profile} />

              <section
                id="accion-especificaciones"
                aria-labelledby="accion-especificaciones-title"
                className="mt-12 scroll-mt-12 border-t border-border pt-10"
              >
                <h2 id="accion-especificaciones-title" className="text-2xl font-semibold sm:text-3xl">
                  Especificaciones
                </h2>
                <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-fg-muted">
                  Datos del instrumento tal como se muestran en la plataforma.
                </p>
                <StockDataList rows={specRows(asset)} className="mt-6" />
              </section>
            </div>

            {/* Panel de operación: primero en móvil y fijo en escritorio, bajo la subnavegación. */}
            <aside className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-32">
              <div className="rounded-bento border border-border bg-bg shadow-frame">
                <h2 className="label border-b border-border px-5 py-4">Resumen de operación</h2>
                <div className="px-5 pt-2 pb-5">
                  <dl className="divide-y divide-border border-b border-border">
                    <div className="flex items-baseline justify-between gap-3 py-3 text-[15px]">
                      <dt className="text-fg-muted">Comisión plataforma</dt>
                      <dd className="shrink-0 font-medium text-fg">
                        <span className="num">0%</span>
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-3 text-[15px]">
                      <dt className="text-fg-muted">Mínimo por orden</dt>
                      <dd className="shrink-0 font-medium text-fg">
                        <span className="num">US$10</span>
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-3 text-[15px]">
                      <dt className="text-fg-muted">Modo demo</dt>
                      <dd className="text-right font-medium text-fg">
                        <span className="num">US$10.000</span> virtuales
                      </dd>
                    </div>
                  </dl>

                  {/* Mismo destino que la CTA del hero; en móvil el hero ya está a la vista. */}
                  <Link
                    href={`/app/accion/${asset.symbol}`}
                    aria-label={operateLabel}
                    className={cn(buttonClasses({ variant: "secondary", size: "md" }), "mt-5 hidden w-full lg:inline-flex")}
                  >
                    Operar en la demo
                  </Link>

                  <Link
                    href="/acciones"
                    className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                  >
                    Ver todo el catálogo <span aria-hidden="true">→</span>
                  </Link>

                  <p className="mt-3 text-xs leading-relaxed text-fg-muted">
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
      </CatalogBody>
    </>
  );
}
