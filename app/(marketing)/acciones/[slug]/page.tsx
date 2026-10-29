import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { aboutForTicker } from "@/content/tickers";
import { LandingSection } from "@/components/landing/section";
import { stockDescription, stockParagraph, stockTitle } from "@/lib/seo/copy";
import { breadcrumbJsonLd, financialProductJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, resolvePublicAsset } from "@/lib/seo/public-catalog";

export const revalidate = 3600;
/** Un slug desconocido entra a la página y muestra el 404 con H1, dentro del layout. */
export const dynamicParams = true;

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

  const about = aboutForTicker(asset.symbol);
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
      <article className="max-w-2xl">
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
        <p className="label mt-6">{asset.ticker}</p>
        <h1 id="accion-title" className="mt-3 text-3xl sm:text-4xl">
          {asset.name}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">{stockParagraph(asset)}</p>
        {about ? <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">{about.es}</p> : null}
        <p className="mt-8">
          <Link
            href={`/app/accion/${asset.symbol}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Operar {asset.name} en la demo
          </Link>
        </p>
      </article>
    </LandingSection>
  );
}
