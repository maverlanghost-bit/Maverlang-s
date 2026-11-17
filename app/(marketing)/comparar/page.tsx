import Link from "next/link";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { CatalogBody } from "@/components/landing/catalog-body";
import { CatalogBreadcrumb } from "@/components/landing/catalog-breadcrumb";
import { PageHero } from "@/components/landing/page-hero";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { COMPARE_PAIRS, comparePath, sectorFor } from "@/lib/seo/categories";
import { breadcrumbJsonLd, itemListJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets, type PublicAsset } from "@/lib/seo/public-catalog";

export const revalidate = 3600;

const TITLE_BASE = "Comparar acciones de EE.UU. tokenizadas";
const TITLE_WITH_BRAND = `${TITLE_BASE} | ${brandShort()}`;
/** Nunca más de 60 caracteres, aunque la marca configurada sea larga. */
const TITLE = TITLE_WITH_BRAND.length <= 60 ? TITLE_WITH_BRAND : TITLE_BASE;

const DESCRIPTION =
  "Compara acciones tokenizadas de EE.UU. lado a lado: ingresos, utilidad, EPS y dividendos de la SEC, con precio y rendimiento relativo a un mes.";

export const metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/comparar",
  absolute: true,
});

/** Pares sugeridos cuyos dos tickers existen hoy en el catálogo público. */
function validPairs(assets: readonly PublicAsset[]): { a: PublicAsset; b: PublicAsset }[] {
  const byTicker = new Map<string, PublicAsset>();
  for (const asset of assets) byTicker.set(asset.ticker.toLowerCase(), asset);
  const pairs: { a: PublicAsset; b: PublicAsset }[] = [];
  for (const [left, right] of COMPARE_PAIRS) {
    const a = byTicker.get(left.toLowerCase());
    const b = byTicker.get(right.toLowerCase());
    if (a && b && a.slug !== b.slug) pairs.push({ a, b });
  }
  return pairs;
}

/** Logo del activo con el mismo borde en todos los tamaños del hub. */
function PairLogo({
  asset,
  size,
  eager = false,
}: {
  asset: PublicAsset;
  size: number;
  eager?: boolean;
}) {
  return (
    <TickerLogo
      symbol={asset.symbol}
      name={asset.name}
      logoUrl={logoPathFromSymbol(asset.symbol)}
      size={size}
      decorative
      loading={eager ? "eager" : "lazy"}
      sizes={`${size}px`}
    />
  );
}

/** Tarjeta "A vs B": los dos logos, nombres, sector y enlace. Toda la tarjeta es el enlace. */
function PairCard({ a, b }: { a: PublicAsset; b: PublicAsset }) {
  const leftSector = sectorFor(a)?.name ?? null;
  const rightSector = sectorFor(b)?.name ?? null;
  const sector =
    leftSector && rightSector
      ? leftSector === rightSector
        ? `Sector: ${leftSector}`
        : `${leftSector} vs ${rightSector}`
      : (leftSector ?? rightSector);

  return (
    <Link
      href={comparePath(a, b)}
      aria-label={`Comparar ${a.name} con ${b.name}`}
      className="group flex h-full flex-col gap-6 rounded-bento border border-border bg-bg p-5 transition-colors duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-1 md:p-6"
    >
      <span aria-hidden className="flex items-center gap-3">
        <PairLogo asset={a} size={44} />
        <span className="font-mono text-[13px] leading-none text-fg-muted">vs</span>
        <PairLogo asset={b} size={44} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-snug font-semibold tracking-tight text-fg">
          {a.name} <span className="font-normal text-fg-muted">vs</span> {b.name}
        </span>
        <span className="num mt-1.5 block text-[13px] text-fg-muted">
          {a.ticker} · {b.ticker}
        </span>
        {sector ? <span className="mt-1 block text-[13px] leading-relaxed text-fg-muted">{sector}</span> : null}
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-fg">
        Comparar{" "}
        <span aria-hidden className="transition-transform duration-[140ms] ease-spring group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}

export default async function CompararPage() {
  const assets = await listPublicAssets();
  const pairs = validPairs(assets);
  const featured = pairs[0];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Comparar", path: "/comparar" },
        ])}
      />
      {pairs.length > 0 ? (
        <JsonLd
          data={itemListJsonLd({
            name: "Comparaciones de acciones tokenizadas",
            path: "/comparar",
            items: pairs.map(({ a, b }) => ({
              name: `${a.name} vs ${b.name}`,
              path: comparePath(a, b),
            })),
          })}
        />
      ) : null}

      <PageHero
        titleId="comparar-title"
        breadcrumb={<CatalogBreadcrumb items={[{ name: "Inicio", href: "/" }, { name: "Comparar" }]} />}
        eyebrow="Comparar"
        title="Comparar acciones tokenizadas"
        factsLabel="Comparaciones"
        facts={[pairs.length === 1 ? "1 comparación disponible" : `${pairs.length} comparaciones disponibles`]}
        actions={
          <>
            {pairs.length > 0 ? (
              <Link href="/acciones" className={buttonClasses({ variant: "primary", size: "lg" })}>
                Ver el catálogo completo
              </Link>
            ) : null}
            <Link
              href="/categorias"
              className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none"
            >
              Explorar por categorías
            </Link>
          </>
        }
        aside={
          featured ? (
            <div
              aria-hidden
              className="flex items-center justify-center gap-5 rounded-bento border border-border bg-surface-1 px-6 py-12 sm:gap-8 md:py-16"
            >
              <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                <PairLogo asset={featured.a} size={88} eager />
                <span className="num text-sm font-medium text-fg">{featured.a.ticker}</span>
              </div>
              <span className="font-mono text-sm text-fg-muted">vs</span>
              <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                <PairLogo asset={featured.b} size={88} eager />
                <span className="num text-sm font-medium text-fg">{featured.b.ticker}</span>
              </div>
            </div>
          ) : undefined
        }
      >
        <p>
          Dos activos lado a lado: datos de la empresa según la SEC, precio del token y rendimiento relativo del
          último mes. Comparar no es recomendar.
        </p>
      </PageHero>

      <CatalogBody>
        {pairs.length === 0 ? (
          <EmptyState
            title="Las comparaciones no están disponibles ahora."
            description="Las fichas de los pares todavía no están publicadas. Mientras tanto puedes revisar el catálogo completo."
            action={
              <Link href="/acciones" className={buttonClasses({ variant: "primary" })}>
                Ver el catálogo completo
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pairs.map(({ a, b }) => (
              <li key={`${a.slug}-vs-${b.slug}`}>
                <PairCard a={a} b={b} />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-12 max-w-[68ch] border-t border-border pt-6 text-[13px] leading-relaxed text-fg-muted">
          Los datos de la empresa vienen de la SEC EDGAR y los precios se mueven durante el día. Fuera del horario
          regular de la bolsa de EE.UU. el precio puede variar más. No es una recomendación de inversión.
        </p>
      </CatalogBody>
    </>
  );
}
