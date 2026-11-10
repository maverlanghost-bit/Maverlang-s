import Link from "next/link";
import { PublicCatalogGrid, type PublicCatalogItem } from "@/components/landing/public-catalog-grid";
import { LandingSection } from "@/components/landing/section";
import { HUB_DESCRIPTION, HUB_TITLE } from "@/lib/seo/copy";
import { assetsInCategory, CATEGORIES, MIN_CATEGORY_SIZE } from "@/lib/seo/categories";
import { pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets } from "@/lib/seo/public-catalog";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: HUB_TITLE,
  description: HUB_DESCRIPTION,
  path: "/acciones",
  absolute: true,
});

/** Hub indexable: enlaza cada ficha pública del catálogo visible. */
export default async function AccionesPage() {
  const assets = [...(await listPublicAssets())].sort(
    (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.ticker.localeCompare(b.ticker),
  );

  /** Enlaces a las categorías publicables: mismo umbral que sus páginas. */
  const categoryLinks = CATEGORIES.map((category) => ({
    category,
    count: assetsInCategory(category.slug, assets).length,
  })).filter(({ count }) => count >= MIN_CATEGORY_SIZE);

  /** Sólo los campos del contrato compartido con la grilla pública. */
  const catalog: readonly PublicCatalogItem[] = assets.map(({ slug, name, ticker, symbol, etf }) => ({
    slug,
    name,
    ticker,
    symbol,
    etf,
  }));

  return (
    <LandingSection titleId="acciones-title">
      <div className="max-w-2xl">
        <p className="label">Acciones</p>
        <h1 id="acciones-title" className="mt-3 text-3xl sm:text-4xl">
          Acciones de EE.UU.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
          Fracciones de acciones tokenizadas de EE.UU., desde Chile. Cada ficha describe un token que
          sigue el precio. La demo usa saldo ficticio y se opera 24/7.
        </p>
        <ul className="mt-6 flex flex-wrap items-center gap-2">
          <li className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            <span className="font-mono font-medium tabular-nums text-fg">{assets.length}</span>
            <span>activos disponibles</span>
          </li>
          <li className="inline-flex items-center rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Fracciones desde US$10
          </li>
          <li className="inline-flex items-center rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Horario 24/7 (xStocks)
          </li>
          <li className="inline-flex items-center rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Autocustodia en Solana SPL
          </li>
        </ul>
      </div>
      {categoryLinks.length > 0 ? (
        <nav aria-label="Categorías de acciones" className="mt-8">
          <p className="label">Explorar por categoría</p>
          <ul className="mt-3 flex flex-wrap items-center gap-2">
            {categoryLinks.map(({ category, count }) => (
              <li key={category.slug}>
                <Link
                  href={`/categorias/${category.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 text-xs font-medium text-fg-body transition duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20 sm:min-h-9 sm:text-sm"
                >
                  <span>{category.name}</span>
                  <span className="num text-fg-muted">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {assets.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">El catálogo no está disponible ahora.</p>
      ) : (
        <div className="mt-10">
          <PublicCatalogGrid assets={catalog} />
          <aside className="mt-8 rounded-3xl border border-border bg-surface-1 p-6 md:p-8">
            <h2 className="text-base font-medium text-fg">Prueba la demo con US$10.000 ficticios</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-body">
              Saldo de mentira, precios reales: compra y vende fracciones sin plata de por medio. El
              token queda en tu propia billetera, no en la nuestra.
            </p>
            <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/app/registro"
                className="inline-flex min-h-11 items-center rounded-full bg-fg px-5 text-sm text-white transition duration-[140ms] ease-spring hover:bg-[#1f2329] focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
              >
                Crear cuenta demo
              </Link>
              <Link
                href="/como-funciona"
                className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
              >
                Cómo funciona
              </Link>
            </p>
          </aside>
        </div>
      )}
    </LandingSection>
  );
}
