import Link from "next/link";
import { PublicCatalogGrid, type PublicCatalogItem } from "@/components/landing/public-catalog-grid";
import { LandingSection } from "@/components/landing/section";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
      <div className="max-w-3xl">
        <p className="label">Acciones</p>
        <h1 id="acciones-title" className="mt-3 text-3xl sm:text-4xl">
          Acciones de EE.UU.
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-pretty text-fg-body">
          Fracciones de acciones tokenizadas de EE.UU., desde Chile. Cada ficha describe un token que
          sigue el precio. La demo usa saldo ficticio y se opera 24/7.
        </p>
        {/* Una sola línea de datos: cada hecho lleva su separador dentro del
            propio `span`, así ninguno queda huérfano al envolver a 360 px. */}
        <p className="mt-5 flex max-w-[62ch] flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums text-fg-body [&>span+span]:before:mr-3 [&>span+span]:before:text-fg-subtle [&>span+span]:before:content-['·']">
          <span>
            <span className="num font-medium text-fg">{assets.length}</span> activos disponibles
          </span>
          <span>Fracciones desde US${LANDING_MIN_ORDER_USD}</span>
          <span>Horario 24/7 (xStocks)</span>
          <span>Autocustodia en Solana SPL</span>
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/comparar"
            className="inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Comparar activos <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>

      {categoryLinks.length > 0 ? (
        <nav aria-label="Categorías de acciones" className="mt-8 border-t border-border pt-5">
          <p className="label">Explorar por categoría</p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-0">
            {categoryLinks.map(({ category, count }) => (
              <li key={category.slug}>
                <Link
                  href={`/categorias/${category.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-body transition-colors hover:text-fg"
                >
                  <span className="underline decoration-border underline-offset-4">{category.name}</span>
                  <span className="num text-xs text-fg-muted">{count}</span>
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
        <div className="mt-8 max-w-5xl">
          <PublicCatalogGrid assets={catalog} />
          <aside className="mt-12 max-w-2xl border-t border-border pt-8">
            <h2 className="text-2xl sm:text-3xl">Prueba la demo con US$10.000 ficticios</h2>
            <p className="mt-2 max-w-[62ch] text-base leading-relaxed text-pretty text-fg-body">
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
