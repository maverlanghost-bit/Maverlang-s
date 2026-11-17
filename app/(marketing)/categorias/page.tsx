import type { Metadata } from "next";
import Link from "next/link";
import { CatalogBody } from "@/components/landing/catalog-body";
import { CatalogBreadcrumb } from "@/components/landing/catalog-breadcrumb";
import { CatalogLogoStack } from "@/components/landing/catalog-logo-stack";
import { PageHero } from "@/components/landing/page-hero";
import { ProductFrame } from "@/components/landing/product-frame";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  assetsInCategory,
  CATEGORIES,
  MIN_CATEGORY_SIZE,
  type CatalogCategory,
} from "@/lib/seo/categories";
import { breadcrumbJsonLd, itemListJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, type PublicAsset } from "@/lib/seo/public-catalog";

export const revalidate = 3600;

/** 44 caracteres con la marca por defecto: cabe en el tope de 60. */
const TITLE = `Categorías de acciones de EE.UU. | ${brandShort()}`;
/** 140 caracteres: entre 120 y 155. */
const DESCRIPTION =
  "Categorías de acciones de EE.UU. tokenizadas: sectores como tecnología, salud, finanzas o energía, y selecciones editoriales con sus fichas.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/categorias",
  absolute: true,
});

/** Nombre, conteo real y ejemplos de cada categoría publicable. */
type PublishedCategory = {
  category: CatalogCategory;
  /** Activos reales de la categoría: de acá salen el conteo y los ejemplos. */
  members: readonly PublicAsset[];
};

/** Mismo texto de siempre: 1 activo / N activos. */
function countLabel(count: number): string {
  return count === 1 ? "activo" : "activos";
}

/**
 * Tarjeta de categoría: pila de logos de sus primeros miembros, nombre, conteo
 * real y hasta tres tickers de ejemplo. Toda la tarjeta es el enlace.
 */
function CategoryCard({ category, members }: PublishedCategory) {
  const count = members.length;
  const examples = members.slice(0, 3).map((asset) => asset.ticker);

  return (
    <Link
      href={`/categorias/${category.slug}`}
      className="group flex h-full min-h-44 flex-col gap-6 rounded-bento border border-border bg-bg p-5 transition-colors duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-1 md:p-6"
    >
      <span className="flex items-center justify-between gap-3">
        <CatalogLogoStack assets={members} max={5} size={36} />
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-fg-muted transition-colors duration-[140ms] ease-spring group-hover:border-fg group-hover:bg-fg group-hover:text-white"
        >
          →
        </span>
      </span>
      <span className="mt-auto min-w-0">
        <span className="block text-lg leading-snug font-semibold tracking-tight text-fg">{category.name}</span>
        <span className="num mt-1.5 block text-[13px] leading-snug text-fg-muted">
          <span className="font-medium text-fg">{count}</span> {countLabel(count)}
        </span>
        <span className="num mt-1 block truncate text-xs leading-relaxed text-fg-muted">
          <span className="sr-only">Ejemplos: </span>
          {examples.join(" · ")}
        </span>
      </span>
    </Link>
  );
}

function CategoryGroup({
  id,
  title,
  intro,
  items,
}: {
  id: string;
  title: string;
  intro?: string;
  items: readonly PublishedCategory[];
}) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <h2 id={id} className="text-2xl font-semibold sm:text-3xl">
        {title}
      </h2>
      {intro ? <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-pretty text-fg-muted">{intro}</p> : null}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.category.slug}>
            <CategoryCard {...item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Hub de categorías: sólo enlaza las que tienen ficha suficiente. */
export default async function CategoriasPage() {
  const assets = await listPublicAssets();
  /** Mismo umbral que las páginas de categoría: nunca se enlaza un 404. */
  const published: PublishedCategory[] = CATEGORIES.map((category) => ({
    category,
    members: assetsInCategory(category.slug, assets),
  })).filter(({ members }) => members.length >= MIN_CATEGORY_SIZE);

  const sectors = published.filter(({ category }) => category.kind === "sector");
  const lists = published.filter(({ category }) => category.kind === "lista");
  const preview = published.slice(0, 4);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Categorías", path: "/categorias" },
        ])}
      />
      <JsonLd
        data={itemListJsonLd({
          name: "Categorías",
          path: "/categorias",
          items: published.map(({ category }) => ({
            name: category.name,
            path: `/categorias/${category.slug}`,
          })),
        })}
      />

      <PageHero
        titleId="categorias-title"
        breadcrumb={<CatalogBreadcrumb items={[{ name: "Inicio", href: "/" }, { name: "Categorías" }]} />}
        eyebrow="Categorías"
        title="Categorías de acciones"
        factsLabel="Categorías disponibles"
        facts={
          published.length > 0
            ? [
                <span key="all">
                  <span className="num font-medium text-fg">{published.length}</span> categorías
                </span>,
                <span key="sectors">
                  <span className="num font-medium text-fg">{sectors.length}</span>{" "}
                  {sectors.length === 1 ? "sector" : "sectores"}
                </span>,
                <span key="lists">
                  <span className="num font-medium text-fg">{lists.length}</span>{" "}
                  {lists.length === 1 ? "selección" : "selecciones"}
                </span>,
              ]
            : undefined
        }
        actions={
          <>
            <Link href="/acciones" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              Ver el catálogo completo
            </Link>
            <Link
              href="/como-funciona"
              className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Cómo funciona
            </Link>
          </>
        }
        aside={
          preview.length > 0 ? (
            <ProductFrame decorative label="/categorias" bodyClassName="p-0 md:p-0">
              <ul className="divide-y divide-border">
                {preview.map(({ category, members }, index) => (
                  <li
                    key={category.slug}
                    className={`flex items-center justify-between gap-4 px-5 py-4 ${index >= 3 ? "max-md:hidden" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-fg">{category.name}</span>
                      <span className="num block text-xs text-fg-muted">
                        {members.length} {countLabel(members.length)}
                      </span>
                    </span>
                    <CatalogLogoStack assets={members} max={4} size={32} eager />
                  </li>
                ))}
              </ul>
            </ProductFrame>
          ) : undefined
        }
      >
        <p>
          Los sectores salen de la clasificación SIC que la SEC registra para cada empresa; las selecciones agrupan
          activos por tema o por un dato publicado en la SEC. Cada categoría enlaza a las fichas públicas y no es una
          recomendación de inversión.
        </p>
      </PageHero>

      <CatalogBody>
        {published.length === 0 ? (
          <EmptyState
            title="Las categorías no están disponibles ahora."
            description="No pudimos cargar los sectores ni las selecciones. Recarga la página en unos minutos."
            action={
              <Link href="/acciones" className={buttonClasses({ variant: "secondary" })}>
                Ver el catálogo completo
              </Link>
            }
          />
        ) : (
          <>
            {sectors.length > 0 ? (
              <CategoryGroup id="categorias-sectores" title="Sectores" items={sectors} />
            ) : null}

            {lists.length > 0 ? (
              <CategoryGroup
                id="categorias-selecciones"
                title="Selecciones"
                intro={`Agrupaciones por tema o por un dato de la SEC. Las de criterio editorial son una selección de ${brandShort()}, no una recomendación.`}
                items={lists}
              />
            ) : null}
          </>
        )}
      </CatalogBody>
    </>
  );
}
