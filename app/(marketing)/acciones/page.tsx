import Link from "next/link";
import { PublicCatalogGrid, type PublicCatalogItem } from "@/components/landing/public-catalog-grid";
import { LandingSection } from "@/components/landing/section";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HUB_DESCRIPTION, HUB_TITLE } from "@/lib/seo/copy";
import { assetsInCategory, CATEGORIES, MIN_CATEGORY_SIZE, sectorFor } from "@/lib/seo/categories";
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

  /**
   * Sólo los campos del contrato compartido con la grilla pública. El sector
   * se resuelve acá, en el servidor: el cliente no importa `categories.ts`.
   */
  const catalog: readonly PublicCatalogItem[] = assets.map((asset) => ({
    slug: asset.slug,
    name: asset.name,
    ticker: asset.ticker,
    symbol: asset.symbol,
    etf: asset.etf,
    sector: sectorFor(asset)?.name ?? null,
  }));

  return (
    <LandingSection titleId="acciones-title" density="compact">
      <div className="max-w-2xl">
        <p className="label">Acciones</p>
        <h1 id="acciones-title" className="mt-3 text-3xl sm:text-4xl">
          Acciones de EE.UU.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-body">
          Fracciones de acciones tokenizadas de EE.UU., desde Chile. Cada ficha describe un token que
          sigue el precio. La demo usa saldo ficticio y se opera 24/7.
        </p>
        <ul className="mt-5 flex flex-wrap items-center gap-2">
          <li className="inline-flex items-center gap-1 rounded-full bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            <span className="font-mono font-medium tabular-nums text-fg">{assets.length}</span>
            <span>activos disponibles</span>
          </li>
          <li className="inline-flex items-center rounded-full bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Fracciones desde US$10
          </li>
          <li className="inline-flex items-center rounded-full bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Horario 24/7 (xStocks)
          </li>
          <li className="inline-flex items-center rounded-full bg-surface-1 px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm">
            Autocustodia en Solana SPL
          </li>
        </ul>
        <p className="mt-1 text-sm">
          <Link
            href="/comparar"
            className="inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Comparar activos →
          </Link>
        </p>
      </div>

      {categoryLinks.length > 0 ? (
        <nav aria-label="Categorías de acciones" className="mt-8">
          <p className="label">Explorar por categoría</p>
          <ul className="mt-3 flex flex-wrap items-center gap-2">
            {categoryLinks.map(({ category, count }) => (
              <li key={category.slug}>
                <Link
                  href={`/categorias/${category.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-control bg-bg px-4 text-xs font-medium text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-1 sm:min-h-9 sm:text-sm"
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
        <div className="mt-10">
          <EmptyState
            title="El catálogo no está disponible ahora."
            description="No pudimos cargar la lista de activos. Recarga la página en unos minutos."
            action={
              <Link href="/" className={buttonClasses({ variant: "secondary" })}>
                Volver al inicio
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8">
          <PublicCatalogGrid assets={catalog} />
          <aside className="mt-10 rounded-3xl bg-surface-1 p-6 md:p-8">
            <h2 className="text-2xl sm:text-3xl">Prueba la demo con US$10.000 ficticios</h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-fg-body">
              Saldo de mentira, precios reales: compra y vende fracciones sin plata de por medio. El
              token queda en tu propia billetera, no en la nuestra.
            </p>
            <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/app/registro" className={buttonClasses({ variant: "primary" })}>
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
