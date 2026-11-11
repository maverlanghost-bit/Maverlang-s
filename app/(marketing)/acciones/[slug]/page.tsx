import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ShareCardButton } from "@/components/domain/share-card-button";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection } from "@/components/landing/section";
import {
  StockAboutSections,
  StockExploreSection,
  StockFaqSection,
  StockSimilarSection,
} from "@/components/landing/stock-rich-sections";
import { StockLivePrice } from "@/components/landing/stock-live-price";
import { Badge } from "@/components/ui/badge";
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

const specCellClass = "rounded-2xl bg-bg p-4 shadow-hairline";

const primaryCtaClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-fg px-5 text-sm font-medium text-white transition duration-[140ms] ease-spring hover:bg-[#1f2329] active:scale-[0.98]";

const secondaryCtaClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-control bg-bg px-5 text-sm font-medium text-fg transition duration-[140ms] ease-spring hover:bg-surface-1";

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
        {/* Hero de producto: identidad + precio y CTA en móvil, antes de cualquier texto. */}
        <header className="mt-6 border-b border-border pb-8">
          <div className="flex items-start gap-4">
            <TickerLogo
              symbol={asset.symbol}
              name={asset.name}
              logoUrl={logoPathFromSymbol(asset.symbol)}
              size={64}
              loading="eager"
              sizes="64px"
            />
            <div className="min-w-0 flex-1">
              <p className="label">
                {asset.ticker} · {kind}
              </p>
              <h1 id="accion-title" className="mt-2 text-4xl text-balance md:text-5xl">
                {asset.name}
              </h1>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ul className="flex min-w-0 flex-wrap gap-2">
              <li>
                <Badge tone="neutral">Operación 24/7</Badge>
              </li>
              <li>
                <Badge tone="neutral">Fracciones desde US$10</Badge>
              </li>
            </ul>
            {/* A la derecha del titular; en 390 px cae a su propia línea. */}
            <div className="ml-auto shrink-0">
              <ShareCardButton id={asset.slug} name={asset.name} />
            </div>
          </div>

          {/* En móvil el panel cae justo debajo: el precio y el CTA viven acá, en el hero. */}
          <div className="mt-6 lg:hidden">
            <StockLivePrice symbol={asset.symbol} size="lg" />
            <p className="mt-1 text-xs text-fg-muted">US$ por token · fracciones desde US$10</p>
            <Link
              href={`/app/accion/${asset.symbol}`}
              aria-label={`Operar ${asset.name} (${asset.ticker}) en la demo con saldo ficticio`}
              className={cn(primaryCtaClass, "mt-4")}
            >
              Operar en la demo
            </Link>
          </div>
        </header>

        <div className="mt-10 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
          <div className="order-2 min-w-0 lg:order-1">
            <StockAboutSections asset={asset} profile={profile} />

            <section aria-labelledby="accion-especificaciones" className="mt-10">
              <h2 id="accion-especificaciones" className="text-2xl sm:text-3xl">
                Especificaciones del Activo Tokenizado
              </h2>
              <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-fg-muted">
                Datos del instrumento tal como se muestran en la plataforma.
              </p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {specRows(asset).map((row) => (
                  <div key={row.label} className={specCellClass}>
                    <dt className="label">{row.label}</dt>
                    <dd className={cn("mt-1.5 text-sm font-medium text-fg", row.mono && "num")}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {/* Panel de operación: en escritorio es la caja de compra sticky del costado. */}
          <aside className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-3xl bg-bg shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-5 py-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-body">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-up motion-safe:animate-pulse" />
                  En vivo · cada 30 s
                </p>
                <p className="label">Resumen de operación</p>
              </div>
              <div className="px-5 py-5">
                <div className="hidden border-b border-border pb-4 lg:block">
                  <p className="label">Precio del token</p>
                  <div className="mt-2">
                    <StockLivePrice symbol={asset.symbol} size="lg" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">US$ por token.</p>
                </div>

                <dl className="divide-y divide-border">
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-fg-muted">Comisión plataforma</dt>
                    <dd className="shrink-0 font-medium text-fg">
                      <span className="num">0%</span>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-fg-muted">Mínimo por orden</dt>
                    <dd className="shrink-0 font-medium text-fg">
                      <span className="num">US$10</span>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <dt className="text-fg-muted">Modo demo</dt>
                    <dd className="text-right font-medium text-fg">
                      <span className="num">US$10.000</span> virtuales
                    </dd>
                  </div>
                </dl>

                <Link
                  href={`/app/accion/${asset.symbol}`}
                  aria-label={`Operar ${asset.name} (${asset.ticker}) en la demo con saldo ficticio`}
                  className={cn(primaryCtaClass, "mt-5 hidden lg:inline-flex")}
                >
                  Operar en la demo
                </Link>
                <Link href="/acciones" className={cn(secondaryCtaClass, "mt-2.5")}>
                  Ver todo el catálogo
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
      </article>
    </LandingSection>
  );
}
