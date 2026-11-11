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
import { listPublicAssets } from "@/lib/seo/public-catalog";

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

/** Etiqueta corta y literal: no insinúa popularidad ni rendimiento. */
function kindLabel(category: CatalogCategory): string {
  if (category.kind === "sector") return "Sector";
  return category.editorial ? "Selección editorial" : "Selección por dato de la SEC";
}

function CategoryCard({ category, count }: { category: CatalogCategory; count: number }) {
  return (
    <Link
      href={`/categorias/${category.slug}`}
      className="group flex min-h-24 flex-col justify-between gap-4 rounded-2xl bg-bg p-5 shadow-card transition hover:bg-surface-1"
    >
      <div>
        <p className="label">{kindLabel(category)}</p>
        <p className="mt-2 text-base font-medium text-fg">{category.name}</p>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
        <span>
          <span className="num font-medium text-fg-body">{count}</span>{" "}
          {count === 1 ? "activo" : "activos"}
        </span>
        <span className="font-medium text-brand transition-transform group-hover:translate-x-0.5">
          Ver categoría →
        </span>
      </div>
    </Link>
  );
}

/** Hub de categorías: sólo enlaza las que tienen ficha suficiente. */
export default async function CategoriasPage() {
  const assets = await listPublicAssets();
  /** Mismo umbral que las páginas de categoría: nunca se enlaza un 404. */
  const published = CATEGORIES.map((category) => ({
    category,
    count: assetsInCategory(category.slug, assets).length,
  })).filter(({ count }) => count >= MIN_CATEGORY_SIZE);

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

      <nav aria-label="Migas" className="text-sm text-fg-muted">
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

      <header className="mt-8 max-w-2xl">
        <p className="label">Categorías</p>
        <h1 id="categorias-title" className="mt-3 text-3xl sm:text-4xl">
          Categorías de acciones
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-fg-body">
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
            <section aria-labelledby="categorias-sectores" className="mt-12">
              <h2 id="categorias-sectores" className="text-2xl sm:text-3xl">
                Sectores
              </h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectors.map(({ category, count }) => (
                  <li key={category.slug}>
                    <CategoryCard category={category} count={count} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {lists.length > 0 ? (
            <section aria-labelledby="categorias-selecciones" className="mt-12">
              <h2 id="categorias-selecciones" className="text-2xl sm:text-3xl">
                Selecciones
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
                Agrupaciones por tema o por un dato de la SEC. Las de criterio editorial son una
                selección de {brandShort()}, no una recomendación.
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lists.map(({ category, count }) => (
                  <li key={category.slug}>
                    <CategoryCard category={category} count={count} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <p className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <Link
          href="/acciones"
          className="inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
        >
          Ver el catálogo completo
        </Link>
        <Link
          href="/como-funciona"
          className="inline-flex min-h-11 items-center text-fg-body underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
        >
          Cómo funciona
        </Link>
      </p>
    </LandingSection>
  );
}
