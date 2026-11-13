import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ShareCardButton } from "@/components/domain/share-card-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection } from "@/components/landing/section";
import {
  StockAboutSections,
  StockCategoryChips,
  StockExploreSection,
  StockFaqSection,
  StockSimilarSection,
} from "@/components/landing/stock-rich-sections";
import { StockLivePrice } from "@/components/landing/stock-live-price";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { companyProfile } from "@/lib/seo/company-profile";
import { stockDescription, stockParagraph, stockTitle } from "@/lib/seo/copy";
import { breadcrumbJsonLd, financialProductJsonLd, JsonLd, simpleFaqJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, resolvePublicAsset } from "@/lib/seo/public-catalog";
import { stockFaq } from "@/lib/seo/stock-copy";

export const revalidate = 3600;
/** Un slug desconocido entra a la página y muestra el 404 con H1, dentro del layout. */
export const dynamicParams = true;

const badgeClass =
  "inline-flex items-center rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] leading-none font-medium text-fg-muted";

const specCellClass = "rounded-2xl border border-border bg-bg p-4";

const primaryCtaClass =
  "mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-fg px-5 text-sm font-medium text-white transition duration-[140ms] ease-spring hover:bg-[#1f2329] active:scale-[0.98]";

const secondaryCtaClass =
  "mt-2.5 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-bg px-5 text-sm font-medium text-fg transition duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-2";

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
  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Acciones", path: "/acciones" },
    { name: asset.name, path: `/acciones/${asset.slug}` },
  ];

  return (
    <LandingSection titleId="accion-title">
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
        <nav aria-label="Migas" className="text-sm text-fg-muted">
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
        <header className="mt-8 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-center sm:gap-6">
          <TickerLogo
            symbol={asset.symbol}
            name={asset.name}
            logoUrl={logoPathFromSymbol(asset.symbol)}
            size={56}
            loading="eager"
            sizes="56px"
          />
          <div className="min-w-0">
            <p className="label">{asset.ticker}</p>
            <h1 id="accion-title" className="mt-2 text-3xl sm:text-4xl">
              {asset.name}
            </h1>
            <ul className="mt-4 flex flex-wrap gap-2">
              <li>
                <span className={badgeClass}>{asset.symbol} · Token SPL</span>
              </li>
              <li>
                <span className={badgeClass}>{asset.etf ? "ETF" : "Acción EE.UU."}</span>
              </li>
              <li>
                <span className={badgeClass}>Operación 24/7</span>
              </li>
              <li>
                <span className={badgeClass}>Fracciones desde US$10</span>
              </li>
            </ul>
            <StockCategoryChips asset={asset} assets={assets} />
          </div>
          <div className="shrink-0 sm:ml-auto">
            <ShareCardButton id={asset.slug} name={asset.name} />
          </div>
        </header>

        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
          <div className="min-w-0">
            <p className="max-w-2xl text-sm leading-relaxed text-fg-body sm:text-base">{stockParagraph(asset)}</p>
            <StockAboutSections asset={asset} profile={profile} />

            <section aria-labelledby="accion-sobre" className="mt-10">
              <h2 id="accion-sobre" className="text-xl sm:text-2xl">
                Sobre el activo
              </h2>
              <div className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed text-fg-body sm:text-base">
                <p>
                  El token se emite 1:1 contra el subyacente listado en EE.UU. y se mueve en Solana (SPL): el precio
                  sigue al de {asset.name}, pero no te convierte en accionista ni da derecho a voto. La demo usa saldo
                  ficticio, así que ninguna orden mueve dinero real.
                </p>
              </div>
            </section>

            <section
              aria-labelledby="accion-especificaciones"
              className="mt-10 rounded-3xl border border-border bg-surface-1 p-6 sm:p-8"
            >
              <h2 id="accion-especificaciones" className="text-xl sm:text-2xl">
                Especificaciones del Activo Tokenizado
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Datos del instrumento tal como se muestran en la plataforma.
              </p>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className={specCellClass}>
                  <dt className="label">Símbolo en plataforma</dt>
                  <dd className="num mt-1.5 text-sm font-medium text-fg">{asset.symbol}</dd>
                </div>
                <div className={specCellClass}>
                  <dt className="label">Subyacente en EE.UU.</dt>
                  <dd className="num mt-1.5 text-sm font-medium text-fg">{asset.ticker}</dd>
                </div>
                <div className={specCellClass}>
                  <dt className="label">Tipo de instrumento</dt>
                  <dd className="mt-1.5 text-sm font-medium text-fg">
                    {asset.etf ? "ETF tokenizado (1:1)" : "Acción tokenizada (1:1)"}
                  </dd>
                </div>
                <div className={specCellClass}>
                  <dt className="label">Emisor del token</dt>
                  <dd className="mt-1.5 text-sm font-medium text-fg">Backed Finance (xStocks)</dd>
                </div>
                <div className={specCellClass}>
                  <dt className="label">Red y custodia</dt>
                  <dd className="mt-1.5 text-sm font-medium text-fg">Solana Mainnet (SPL) · Autocustodia</dd>
                </div>
                <div className={specCellClass}>
                  <dt className="label">Horario de operación</dt>
                  <dd className="mt-1.5 text-sm font-medium text-fg">24/7 en plataforma</dd>
                </div>
              </dl>
            </section>
          </div>

          <aside className="mt-10 lg:mt-0">
            <div className="overflow-hidden rounded-3xl border border-border bg-surface-1 shadow-float lg:sticky lg:top-24">
              <div className="flex items-center gap-1.5 border-b border-border px-5 py-3">
                <span aria-hidden className="size-1.5 rounded-full bg-border-strong" />
                <span aria-hidden className="size-1.5 rounded-full bg-border-strong" />
                <span aria-hidden className="size-1.5 rounded-full bg-border-strong" />
                <p className="label ml-auto">Resumen de operación</p>
              </div>
              <div className="px-5 py-5">
                <div className="border-b border-border pb-4">
                  <p className="label">Precio del token</p>
                  <div className="mt-2">
                    <StockLivePrice symbol={asset.symbol} />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
                    Se actualiza cada 30 s mientras la pestaña está visible.
                  </p>
                </div>

                <dl className="divide-y divide-border">
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-fg-muted">Comisión plataforma</dt>
                    <dd className="num shrink-0 font-medium text-fg">0%</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-fg-muted">Mínimo por orden</dt>
                    <dd className="num shrink-0 font-medium text-fg">US$10</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-fg-muted">Modo demo</dt>
                    <dd className="num shrink-0 font-medium text-fg">US$10.000 virtuales</dd>
                  </div>
                </dl>

                <Link href={`/app/accion/${asset.symbol}`} className={primaryCtaClass}>
                  Operar {asset.name} en la demo
                </Link>
                <Link href="/acciones" className={secondaryCtaClass}>
                  Ver todo el catálogo
                </Link>

                <p className="mt-4 text-[11px] leading-relaxed text-fg-muted">
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
      </article>
    </LandingSection>
  );
}
