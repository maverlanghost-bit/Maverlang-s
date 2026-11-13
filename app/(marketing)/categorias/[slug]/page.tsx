import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { LandingSection } from "@/components/landing/section";
import { PublicAssetCard } from "@/components/landing/public-asset-card";
import { buttonClasses } from "@/components/ui/button";
import { COMPANY_SNAPSHOT_DATE, companyProfile } from "@/lib/seo/company-profile";
import { assetsInCategory, CATEGORIES, MIN_CATEGORY_SIZE, sectorFor } from "@/lib/seo/categories";
import { breadcrumbJsonLd, itemListJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, type PublicAsset } from "@/lib/seo/public-catalog";

export const revalidate = 3600;
/** Un slug desconocido entra a la página y muestra el 404 con el layout. */
export const dynamicParams = true;

/** Única lista que muestra el dato por empresa; el resto no lleva cifras. */
const DIVIDENDS_SLUG = "dividendos";

const NOT_FOUND = {
  title: "Categoría no encontrada",
  description: "La dirección no existe o cambió.",
} as const;

/** Enlaces de texto: una sola receta para toda la ficha de categoría. */
const textLinkClass =
  "inline-flex min-h-11 items-center text-[13px] font-medium text-fg-body underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg";

/** Dato de la SEC: dólares por acción, dos decimales, formato es-CL. */
function usdPerShare(value: number): string {
  return `US$${value.toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Fecha larga sin corrimiento de zona: el ISO del snapshot es UTC. */
function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function categoryBySlug(raw: string) {
  const key = raw.trim().toLowerCase();
  return CATEGORIES.find((category) => category.slug === key) ?? null;
}

type CategoryRow = {
  asset: PublicAsset;
  /** Sólo en `dividendos`: monto por acción de los últimos 12 meses según la SEC. */
  dividend: number | null;
  sourceUrl: string | null;
};

export async function generateStaticParams() {
  const assets = await listPublicAssets();
  /** Las categorías con menos activos que el mínimo no se generan ni se enlazan. */
  return CATEGORIES.filter(
    (category) => assetsInCategory(category.slug, assets).length >= MIN_CATEGORY_SIZE,
  ).map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) {
    return pageMetadata({ ...NOT_FOUND, path: `/categorias/${slug}`, index: false, follow: false });
  }
  const assets = await listPublicAssets();
  if (assetsInCategory(category.slug, assets).length < MIN_CATEGORY_SIZE) {
    return pageMetadata({
      ...NOT_FOUND,
      path: `/categorias/${category.slug}`,
      index: false,
      follow: false,
    });
  }
  return pageMetadata({
    title: category.title,
    description: category.description,
    path: `/categorias/${category.slug}`,
    absolute: true,
  });
}

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) notFound();
  if (slug !== category.slug) permanentRedirect(`/categorias/${category.slug}`);

  const assets = await listPublicAssets();
  const members = assetsInCategory(category.slug, assets);
  if (members.length < MIN_CATEGORY_SIZE) notFound();

  /** Alfabético: no insinúa orden de preferencia ni ranking. */
  const rows: CategoryRow[] = [...members]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
        a.ticker.localeCompare(b.ticker),
    )
    .map((asset) => {
      if (category.slug !== DIVIDENDS_SLUG) return { asset, dividend: null, sourceUrl: null };
      const profile = companyProfile(asset.ticker);
      const perShare = profile?.dividendsPerShareTtm ?? null;
      return {
        asset,
        /** Sin dato o cero no se muestra cifra: nunca se rellena con 0. */
        dividend: perShare !== null && perShare > 0 ? perShare : null,
        sourceUrl: profile?.sourceUrl ?? null,
      };
    });

  const introParagraphs = category.intro
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <LandingSection titleId="categoria-title" density="compact">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Categorías", path: "/categorias" },
          { name: category.name, path: `/categorias/${category.slug}` },
        ])}
      />
      <JsonLd
        data={itemListJsonLd({
          name: category.name,
          path: `/categorias/${category.slug}`,
          items: rows.map(({ asset }) => ({
            name: `${asset.name} (${asset.ticker})`,
            path: `/acciones/${asset.slug}`,
          })),
        })}
      />

      <nav aria-label="Migas" className="text-[13px] text-fg-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link href="/" className="underline decoration-border underline-offset-4 hover:decoration-fg">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href="/categorias"
              className="underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Categorías
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg">
            {category.name}
          </li>
        </ol>
      </nav>

      <header className="mt-8 max-w-3xl">
        <p className="label text-[13px]">{category.kind === "sector" ? "Sector" : "Selección"}</p>
        <h1 id="categoria-title" className="mt-3 text-3xl sm:text-4xl">
          {category.name}
        </h1>
        <div className="mt-4 max-w-[62ch] space-y-3">
          {introParagraphs.map((paragraph, index) => (
            <p
              key={paragraph}
              className={
                index === 0 ? "text-lead text-pretty text-fg-body" : "text-sm leading-relaxed text-pretty text-fg-body"
              }
            >
              {paragraph}
            </p>
          ))}
        </div>
        <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3 text-[13px] leading-relaxed text-fg-muted">
          <span>
            <span className="num font-medium text-fg">{rows.length}</span>{" "}
            {rows.length === 1 ? "activo con ficha pública" : "activos con ficha pública"}
          </span>
          <Link href="/categorias" className={textLinkClass}>
            ← Todas las categorías
          </Link>
        </p>
        {category.editorial ? (
          <div className="mt-4">
            <p className="label text-[13px]">Aviso</p>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-fg-body">
              Selección editorial de {brandShort()}, no es una recomendación.
            </p>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="categoria-activos" className="mt-12">
        <h2 id="categoria-activos" className="border-b border-border pb-3 text-xl sm:text-2xl">
          Activos en {category.name}
        </h2>
        <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-fg-muted">
          Cada enlace abre la ficha pública del token, con sus datos de empresa.
        </p>

        <ul className="mt-6 max-w-4xl divide-y divide-border">
          {rows.map(({ asset, dividend, sourceUrl }) => (
            <li key={asset.slug}>
              <PublicAssetCard
                asset={{
                  slug: asset.slug,
                  name: asset.name,
                  ticker: asset.ticker,
                  symbol: asset.symbol,
                  etf: asset.etf,
                  // En una página de sector el subtítulo repetiría el título.
                  sector: category.kind === "sector" ? null : (sectorFor(asset)?.name ?? null),
                }}
                variant="table"
              />

              {dividend !== null ? (
                <p className="px-1 pt-1 pb-3 text-[13px] leading-snug text-fg-body">
                  Dividendos por acción (12 meses, SEC):{" "}
                  <span className="num font-medium text-fg">{usdPerShare(dividend)}</span>
                </p>
              ) : null}

              {dividend !== null && sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="nofollow noopener"
                  aria-label={`Fuente: SEC EDGAR, datos de ${asset.name}`}
                  className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-fg-muted underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
                >
                  Fuente: SEC EDGAR
                </a>
              ) : null}
            </li>
          ))}
        </ul>

        {category.slug === DIVIDENDS_SLUG ? (
          <p className="mt-6 max-w-[62ch] text-[13px] leading-relaxed text-fg-muted">
            Dividendos por acción de los últimos 12 meses según SEC EDGAR, datos al{" "}
            {longDate(COMPANY_SNAPSHOT_DATE)}. Es un dato histórico, no una proyección.
          </p>
        ) : null}
      </section>

      <div className="mt-12 flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6">
        <Link href="/acciones" className={buttonClasses({ variant: "secondary" })}>
          Ver todas las acciones
        </Link>
        <Link href="/comparar" className={textLinkClass}>
          Comparar activos
        </Link>
      </div>
    </LandingSection>
  );
}
