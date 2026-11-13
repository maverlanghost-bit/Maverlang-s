import Link from "next/link";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingSection } from "@/components/landing/section";
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
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{asset.name}</p>
        <p className="font-mono text-xs text-fg-muted">{asset.ticker}</p>
      </div>
    </div>
  );
}

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
      className="group flex h-full flex-col gap-4 rounded-3xl border border-border bg-surface-1 p-5 transition hover:border-fg/25 hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <AssetRow asset={a} />
        <p aria-hidden className="label pl-[52px] leading-none">
          vs
        </p>
        <AssetRow asset={b} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {sector ? <span className="text-xs text-fg-muted">{sector}</span> : <span />}
        <span className="text-xs font-medium text-brand transition-transform group-hover:translate-x-0.5">
          Comparar →
        </span>
      </div>
    </Link>
  );
}

export default async function CompararPage() {
  const assets = await listPublicAssets();
  const pairs = validPairs(assets);

  return (
    <LandingSection titleId="comparar-title">
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
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
          Dos activos lado a lado: datos de la empresa según la SEC, precio del token y rendimiento relativo del
          último mes. Comparar no es recomendar.
        </p>
        <p className="mt-3 text-sm text-fg-muted">
          {pairs.length === 1 ? "1 comparación disponible" : `${pairs.length} comparaciones disponibles`}
        </p>
      </div>

      {pairs.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">Las comparaciones no están disponibles ahora.</p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {pairs.map(({ a, b }) => (
            <li key={`${a.slug}-vs-${b.slug}`}>
              <PairCard a={a} b={b} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Link
          href="/acciones"
          className="inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
        >
          Ver el catálogo completo
        </Link>
        <Link
          href="/categorias"
          className="inline-flex min-h-11 items-center font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
        >
          Explorar por categorías
        </Link>
      </div>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-fg-muted">
        Los datos de la empresa vienen de la SEC EDGAR y los precios se mueven durante el día. Fuera del horario
        regular de la bolsa de EE.UU. el precio puede variar más. No es una recomendación de inversión.
      </p>
    </LandingSection>
  );
}
