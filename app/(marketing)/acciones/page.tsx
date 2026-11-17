import Link from "next/link";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { CatalogBody } from "@/components/landing/catalog-body";
import { PageHero } from "@/components/landing/page-hero";
import { ProductFrame } from "@/components/landing/product-frame";
import { PublicCatalogGrid, type PublicCatalogItem } from "@/components/landing/public-catalog-grid";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";
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

const SHOWCASE_SIZE = 5;

/** Fichas repartidas a lo largo del catálogo (orden alfabético): determinista, sin azar. */
function pickShowcase(items: readonly PublicCatalogItem[], size: number): PublicCatalogItem[] {
  if (items.length <= size) return [...items];
  const step = items.length / size;
  return Array.from({ length: size }, (_, index) => items[Math.floor(index * step)]).filter(
    (item): item is PublicCatalogItem => Boolean(item),
  );
}

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

  /** Cinco fichas repartidas por el catálogo (no las primeras): sólo datos que ya se cargan. */
  const showcase = pickShowcase(catalog, SHOWCASE_SIZE);

  return (
    <>
      <PageHero
        titleId="acciones-title"
        eyebrow="Acciones"
        title="Acciones de EE.UU."
        facts={[
          <span key="count">
            <span className="num font-medium text-fg">{assets.length}</span> activos disponibles
          </span>,
          <span key="min">Fracciones desde US${LANDING_MIN_ORDER_USD}</span>,
          <span key="hours">Horario 24/7 (xStocks)</span>,
          <span key="custody">Autocustodia en Solana SPL</span>,
        ]}
        factsLabel="Datos del catálogo"
        actions={
          <Link href="/comparar" className={buttonClasses({ variant: "secondary", size: "lg" })}>
            Comparar activos <span aria-hidden="true">→</span>
          </Link>
        }
        aside={
          showcase.length > 0 ? (
            <ProductFrame decorative label="/acciones" bodyClassName="p-0 md:p-0">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="label">Catálogo</span>
                <span className="num text-xs text-fg-muted">{assets.length} activos</span>
              </div>
              <ul className="divide-y divide-border">
                {showcase.map((asset, index) => (
                  <li
                    key={asset.slug}
                    className={`flex items-center gap-3 px-5 py-3 ${index >= 3 ? "max-md:hidden" : ""}`}
                  >
                    <TickerLogo
                      symbol={asset.symbol}
                      name={asset.name}
                      logoUrl={logoPathFromSymbol(asset.symbol)}
                      size={32}
                      decorative
                      loading="eager"
                      sizes="32px"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-fg">{asset.name}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {asset.sector ?? (asset.etf ? "ETF" : "Acción")}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[13px] text-fg-muted">{asset.ticker}</span>
                  </li>
                ))}
              </ul>
            </ProductFrame>
          ) : undefined
        }
      >
        <p>
          Fracciones de acciones tokenizadas de EE.UU., desde Chile. Cada ficha describe un token que sigue el
          precio. La demo usa saldo ficticio y se opera 24/7.
        </p>
      </PageHero>

      <CatalogBody>
        {categoryLinks.length > 0 ? (
          <nav aria-label="Categorías de acciones">
            <p className="label">Explorar por categoría</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {categoryLinks.map(({ category, count }) => (
                <li key={category.slug}>
                  <Link
                    href={`/categorias/${category.slug}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-bg px-4 text-sm font-medium text-fg-body transition-colors duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-1 hover:text-fg"
                  >
                    {category.name}
                    <span className="num text-xs font-normal text-fg-muted">{count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {assets.length === 0 ? (
          <div className={categoryLinks.length > 0 ? "mt-10" : undefined}>
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
          <>
            <div className="mt-8">
              <PublicCatalogGrid assets={catalog} />
            </div>

            <aside className="mt-16 rounded-bento border border-border bg-surface-1 p-6 md:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12">
              <div className="max-w-xl">
                <h2 className="text-2xl font-semibold sm:text-3xl">Prueba la demo con US$10.000 ficticios</h2>
                <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-pretty text-fg-body">
                  Saldo de mentira, precios reales: compra y vende fracciones sin plata de por medio. El token queda
                  en tu propia billetera, no en la nuestra.
                </p>
              </div>
              <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 lg:mt-0 lg:shrink-0">
                <Link href="/app/registro" className={buttonClasses({ variant: "primary", size: "lg" })}>
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
          </>
        )}
      </CatalogBody>
    </>
  );
}
