import type { Metadata } from "next";
import Link from "next/link";
import { LandingSection } from "@/components/landing/section";
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

const linkClass =
  "inline-flex min-h-11 items-center text-sm text-fg-body underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg";

/**
 * Fila de índice: nombre, hasta tres tickers de ejemplo y el conteo real.
 * Sin tarjeta ni sombra: una hairline separa cada entrada.
 */
function CategoryRow({ category, members }: PublishedCategory) {
  const count = members.length;
  const examples = members.slice(0, 3).map((asset) => asset.ticker);

  return (
    <Link
      href={`/categorias/${category.slug}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-border py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:gap-x-6"
    >
      <span className="text-base leading-snug font-medium text-fg underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-border-strong">
        {category.name}
      </span>
      <span className="num col-span-2 row-start-2 truncate text-[13px] leading-relaxed text-fg-muted sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <span className="sr-only">Ejemplos: </span>
        {examples.join(" · ")}
      </span>
      <span className="num col-start-2 row-start-1 text-right text-[13px] leading-snug text-fg-muted sm:col-start-3">
        <span className="font-medium text-fg">{count}</span> {count === 1 ? "activo" : "activos"}
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
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-xl sm:text-2xl">
        {title}
      </h2>
      {intro ? <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-fg-muted">{intro}</p> : null}
      <ul className="mt-5 border-t border-border">
        {items.map((item) => (
          <li key={item.category.slug}>
            <CategoryRow {...item} />
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

  return (
    <LandingSection titleId="categorias-title" density="compact">
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

      <nav aria-label="Migas" className="text-[13px] text-fg-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link href="/" className="underline decoration-border underline-offset-4 hover:decoration-fg">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg">
            Categorías
          </li>
        </ol>
      </nav>

      <header className="mt-8 max-w-3xl">
        <p className="label text-[13px]">Categorías</p>
        <h1 id="categorias-title" className="mt-3 text-3xl sm:text-4xl">
          Categorías de acciones
        </h1>
        <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
          Los sectores salen de la clasificación SIC que la SEC registra para cada empresa; las
          selecciones agrupan activos por tema o por un dato publicado en la SEC. Cada categoría
          enlaza a las fichas públicas y no es una recomendación de inversión.
        </p>
      </header>

      {published.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Las categorías no están disponibles ahora."
            description="No pudimos cargar los sectores ni las selecciones. Recarga la página en unos minutos."
            action={
              <Link href="/acciones" className={buttonClasses({ variant: "secondary" })}>
                Ver el catálogo completo
              </Link>
            }
          />
        </div>
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

      <p className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/acciones" className={linkClass}>
          Ver el catálogo completo
        </Link>
        <Link href="/como-funciona" className={linkClass}>
          Cómo funciona
        </Link>
      </p>
    </LandingSection>
  );
}
