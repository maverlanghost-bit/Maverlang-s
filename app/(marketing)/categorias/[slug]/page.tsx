import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection } from "@/components/landing/section";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { COMPANY_SNAPSHOT_DATE, companyProfile } from "@/lib/seo/company-profile";
import { assetsInCategory, CATEGORIES, MIN_CATEGORY_SIZE } from "@/lib/seo/categories";
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
    <LandingSection titleId="categoria-title">
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

      <nav aria-label="Migas" className="text-sm text-fg-muted">
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

      <header className="mt-8 max-w-2xl">
        <p className="label">{category.kind === "sector" ? "Sector" : "Selección"}</p>
        <h1 id="categoria-title" className="mt-3 text-3xl sm:text-4xl">
          {category.name}
        </h1>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-fg-body sm:text-base">
          {introParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
          <span className="num font-medium text-fg">{rows.length}</span>
          <span>{rows.length === 1 ? "activo con ficha pública" : "activos con ficha pública"}</span>
        </p>
        {category.editorial ? (
          <div className="mt-5 rounded-2xl border border-border bg-surface-1 px-4 py-3">
            <p className="label">Aviso</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-body">
              Selección editorial de {brandShort()}, no es una recomendación.
            </p>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="categoria-activos" className="mt-12">
        <h2 id="categoria-activos" className="text-xl sm:text-2xl">
          Activos en {category.name}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          Cada enlace abre la ficha pública del token, con sus datos de empresa.
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ asset, dividend, sourceUrl }) => (
            <li key={asset.slug}>
              <Link
                href={`/acciones/${asset.slug}`}
                className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(12,15,20,0.03)] transition hover:-translate-y-0.5 hover:border-fg/25 hover:shadow-md focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
              >
                <div className="flex items-center gap-3">
                  <TickerLogo
                    symbol={asset.symbol}
                    name={asset.name}
                    logoUrl={logoPathFromSymbol(asset.symbol)}
                    size={40}
                    decorative
                    loading="lazy"
                    sizes="40px"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{asset.name}</span>
                  <span className="shrink-0 font-mono text-xs text-fg-muted">{asset.ticker}</span>
                </div>

                {dividend !== null ? (
                  <p className="text-xs leading-snug text-fg-body">
                    Dividendos por acción (12 meses, SEC):{" "}
                    <span className="num font-medium text-fg">{usdPerShare(dividend)}</span>
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-1 px-2.5 py-0.5 font-mono text-[11px] font-medium text-fg-body">
                    {asset.symbol}
                  </span>
                  <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-fg-muted">
                    {asset.etf ? "ETF EE.UU." : "Acción EE.UU."}
                  </span>
                  <span className="ml-auto text-xs font-medium text-brand transition-transform group-hover:translate-x-0.5">
                    Ver ficha →
                  </span>
                </div>
              </Link>
              {dividend !== null && sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="nofollow noopener"
                  aria-label={`Fuente: SEC EDGAR, datos de ${asset.name}`}
                  className="mt-1.5 inline-flex min-h-6 items-center text-[11px] text-fg-muted underline decoration-border underline-offset-4 hover:decoration-fg"
                >
                  Fuente: SEC EDGAR
                </a>
              ) : null}
            </li>
          ))}
        </ul>

        {category.slug === DIVIDENDS_SLUG ? (
          <p className="mt-6 max-w-2xl text-[11px] leading-relaxed text-fg-muted">
            Dividendos por acción de los últimos 12 meses según SEC EDGAR, datos al{" "}
            {longDate(COMPANY_SNAPSHOT_DATE)}. Es un dato histórico, no una proyección.
          </p>
        ) : null}
      </section>

      <p className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <Link
          href="/acciones"
          className="inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
        >
          Ver el catálogo completo
        </Link>
        <Link
          href="/categorias"
          className="inline-flex min-h-11 items-center text-fg-body underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
        >
          Todas las categorías
        </Link>
      </p>
    </LandingSection>
  );
}
