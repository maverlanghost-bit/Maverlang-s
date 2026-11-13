import Link from "next/link";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection } from "@/components/landing/section";
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

function AssetRow({ asset }: { asset: PublicAsset }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <TickerLogo
        symbol={asset.symbol}
        name={asset.name}
        logoUrl={logoPathFromSymbol(asset.symbol)}
        size={24}
        decorative
        loading="lazy"
        sizes="24px"
      />
      <span className="min-w-0 flex-1 truncate text-base font-medium text-fg">{asset.name}</span>
      <span className="shrink-0 font-mono text-[13px] text-fg-muted">{asset.ticker}</span>
    </span>
  );
}

/** Fila de índice: dos activos, sector y enlace. Sin tarjeta ni sombra. */
function PairRow({ a, b }: { a: PublicAsset; b: PublicAsset }) {
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
      className="flex flex-col gap-3 border-b border-border py-4 transition-colors hover:bg-surface-1 sm:flex-row sm:items-center sm:gap-8"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <AssetRow asset={a} />
        <span aria-hidden className="font-mono text-[13px] leading-none text-fg-muted">
          vs
        </span>
        <AssetRow asset={b} />
      </span>
      <span className="flex items-center justify-between gap-4 sm:shrink-0 sm:justify-end">
        {sector ? <span className="text-[13px] leading-relaxed text-fg-muted">{sector}</span> : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium text-fg sm:ml-0">
          Comparar <span aria-hidden>→</span>
        </span>
      </span>
    </Link>
  );
}

export default async function CompararPage() {
  const assets = await listPublicAssets();
  const pairs = validPairs(assets);

  return (
    <LandingSection titleId="comparar-title" density="compact">
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

      <div className="max-w-2xl">
        <p className="label">Comparar</p>
        <h1 id="comparar-title" className="mt-3 text-3xl sm:text-4xl">
          Comparar acciones tokenizadas
        </h1>
        <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
          Dos activos lado a lado: datos de la empresa según la SEC, precio del token y rendimiento relativo del
          último mes. Comparar no es recomendar.
        </p>
        <p className="mt-4 text-sm text-fg-muted">
          {pairs.length === 1 ? "1 comparación disponible" : `${pairs.length} comparaciones disponibles`}
        </p>
      </div>

      {pairs.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Las comparaciones no están disponibles ahora."
            description="Las fichas de los pares todavía no están publicadas. Mientras tanto puedes revisar el catálogo completo."
            action={
              <Link href="/acciones" className={buttonClasses({ variant: "primary" })}>
                Ver el catálogo completo
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-8 border-t border-border">
          {pairs.map(({ a, b }) => (
            <li key={`${a.slug}-vs-${b.slug}`}>
              <PairRow a={a} b={b} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        {pairs.length > 0 ? (
          <Link href="/acciones" className={buttonClasses({ variant: "primary" })}>
            Ver el catálogo completo
          </Link>
        ) : null}
        <Link
          href="/categorias"
          className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none"
        >
          Explorar por categorías
        </Link>
      </div>

      <p className="mt-10 max-w-[68ch] border-t border-border pt-6 text-[13px] leading-relaxed text-fg-muted">
        Los datos de la empresa vienen de la SEC EDGAR y los precios se mueven durante el día. Fuera del horario
        regular de la bolsa de EE.UU. el precio puede variar más. No es una recomendación de inversión.
      </p>
    </LandingSection>
  );
}
