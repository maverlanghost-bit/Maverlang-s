import Link from "next/link";

import { TickerLogo } from "@/components/domain/ticker-logo";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import {
  assetsInCategory,
  categoriesFor,
  comparePath,
  COMPARE_PAIRS,
  MIN_CATEGORY_SIZE,
  similarAssets,
} from "@/lib/seo/categories";
import { COMPANY_SNAPSHOT_DATE, type CompanyProfile } from "@/lib/seo/company-profile";
import type { PublicAsset } from "@/lib/seo/public-catalog";
import { stockFacts, stockIntro } from "@/lib/seo/stock-copy";

/**
 * Secciones ricas de la ficha pública (`/acciones/[slug]`).
 *
 * Todo el contenido sale del snapshot de la SEC (`company-profile`) y de las
 * categorías derivadas del catálogo: no hay cifras escritas a mano. Cuando un
 * dato no existe (`null`) simplemente no se muestra.
 */

const specCellClass = "rounded-2xl border border-border bg-bg p-4";

/** "2026-11-10" → "10 de noviembre de 2026" (UTC: la fecha no se corre). */
const SNAPSHOT_DATE_LABEL = (() => {
  const time = Date.parse(`${COMPANY_SNAPSHOT_DATE}T12:00:00Z`);
  if (Number.isNaN(time)) return COMPANY_SNAPSHOT_DATE;
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(time);
})();

const cardLinkClass =
  "group flex h-full min-h-20 flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-white p-4 shadow-[0_1px_2px_rgba(12,15,20,0.03)] transition hover:-translate-y-0.5 hover:border-fg/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20";

const chipLinkClass =
  "inline-flex min-h-9 items-center rounded-full border border-border bg-bg px-3 text-xs font-medium text-fg-body transition duration-[140ms] ease-spring hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20";

/** Chips a las categorías con página real (>= MIN_CATEGORY_SIZE activos). */
export function StockCategoryChips({
  asset,
  assets,
}: {
  asset: PublicAsset;
  assets: readonly PublicAsset[];
}) {
  const categories = categoriesFor(asset).filter(
    (category) => assetsInCategory(category.slug, assets).length >= MIN_CATEGORY_SIZE,
  );
  if (categories.length === 0) return null;

  return (
    <ul aria-label="Categorías de la acción" className="mt-4 flex flex-wrap gap-2">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link href={`/categorias/${category.slug}`} className={chipLinkClass}>
            {category.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Sobre {nombre}" con `stockIntro` y, si hay cifras, "Datos de la empresa". */
export function StockAboutSections({
  asset,
  profile,
}: {
  asset: PublicAsset;
  profile: CompanyProfile | null;
}) {
  const paragraphs = stockIntro(asset, profile);
  const facts = stockFacts(asset, profile);

  return (
    <>
      <section aria-labelledby="accion-sobre-empresa" className="mt-10">
        <h2 id="accion-sobre-empresa" className="text-xl sm:text-2xl">
          Sobre {asset.name}
        </h2>
        <div className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed text-fg-body sm:text-base">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      {facts.length > 0 ? (
        <section
          aria-labelledby="accion-datos-empresa"
          className="mt-10 rounded-3xl border border-border bg-surface-1 p-6 sm:p-8"
        >
          <h2 id="accion-datos-empresa" className="text-xl sm:text-2xl">
            Datos de la empresa
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Cifras reportadas por la empresa a la SEC. Sólo se muestran los datos disponibles.
          </p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className={specCellClass}>
                <dt className="label">{fact.label}</dt>
                <dd className="mt-1.5 text-sm font-medium text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[11px] leading-relaxed text-fg-muted">
            {`Fuente: SEC EDGAR${SNAPSHOT_DATE_LABEL ? `, datos al ${SNAPSHOT_DATE_LABEL}` : ""}.`}
            {profile?.sourceUrl ? (
              <>
                {" "}
                <a
                  href={profile.sourceUrl}
                  target="_blank"
                  rel="nofollow noopener"
                  className="underline decoration-border underline-offset-4 hover:decoration-fg"
                >
                  Ver los informes en SEC EDGAR
                </a>
                .
              </>
            ) : null}
          </p>
        </section>
      ) : null}
    </>
  );
}

/** FAQ de la ficha con `<details>` nativos (sin JavaScript). */
export function StockFaqSection({ items }: { items: readonly { question: string; answer: string }[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="accion-preguntas" className="mt-14">
      <h2 id="accion-preguntas" className="text-xl sm:text-2xl">
        Preguntas frecuentes
      </h2>
      <div className="mt-6 max-w-3xl divide-y divide-border overflow-hidden rounded-3xl border border-border bg-bg">
        {items.map((item) => (
          <details key={item.question} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20 [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <span
                aria-hidden="true"
                className="shrink-0 font-mono text-fg-muted transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-fg-body">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Hasta 6 fichas del mismo sector, sin la propia. */
export function StockSimilarSection({
  asset,
  assets,
}: {
  asset: PublicAsset;
  assets: readonly PublicAsset[];
}) {
  const similar = similarAssets(asset, assets, 6);
  if (similar.length === 0) return null;

  return (
    <section aria-labelledby="accion-parecidas" className="mt-14">
      <h2 id="accion-parecidas" className="text-xl sm:text-2xl">
        Acciones parecidas
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
        Otras fichas del mismo sector. Es información para comparar, no una recomendación.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((item) => (
          <li key={item.slug}>
            <Link href={`/acciones/${item.slug}`} className={cardLinkClass}>
              <div className="flex items-center gap-3">
                <TickerLogo
                  symbol={item.symbol}
                  name={item.name}
                  logoUrl={logoPathFromSymbol(item.symbol)}
                  size={40}
                  decorative
                  loading="lazy"
                  sizes="40px"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{item.name}</span>
                <span className="shrink-0 font-mono text-xs text-fg-muted">{item.ticker}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-surface-1 px-2.5 py-0.5 font-mono text-[11px] font-medium text-fg-body">
                  {item.symbol}
                </span>
                <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-fg-muted">
                  {item.etf ? "ETF EE.UU." : "Acción EE.UU."}
                </span>
                <span className="ml-auto text-xs font-medium text-brand transition-transform group-hover:translate-x-0.5">
                  Ver ficha →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type CompareTarget = { href: string; otherName: string };

/** Par de `COMPARE_PAIRS` que incluye el ticker y existe completo en el catálogo. */
function compareTarget(asset: PublicAsset, assets: readonly PublicAsset[]): CompareTarget | null {
  const ticker = asset.ticker.trim().toUpperCase();
  for (const [left, right] of COMPARE_PAIRS) {
    if (left !== ticker && right !== ticker) continue;
    const a = assets.find((item) => item.ticker.trim().toUpperCase() === left);
    const b = assets.find((item) => item.ticker.trim().toUpperCase() === right);
    if (!a || !b) continue;
    const other = a.ticker.trim().toUpperCase() === ticker ? b : a;
    return { href: comparePath(a, b), otherName: other.name };
  }
  return null;
}

/** Enlaces educativos: guía base y, si aplica, comparación con un par del catálogo. */
export function StockExploreSection({
  asset,
  assets,
}: {
  asset: PublicAsset;
  assets: readonly PublicAsset[];
}) {
  const compare = compareTarget(asset, assets);

  return (
    <section aria-labelledby="accion-aprender" className="mt-14">
      <h2 id="accion-aprender" className="text-xl sm:text-2xl">
        Para seguir entendiendo
      </h2>
      <ul className="mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/guias/que-es-una-accion-tokenizada"
            className="group flex h-full flex-col rounded-2xl border border-border bg-surface-1 p-5 transition hover:border-border-strong hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <span className="label">Guía</span>
            <span className="mt-1.5 font-medium text-fg">Qué es una acción tokenizada</span>
            <span className="mt-1 text-sm leading-relaxed text-fg-muted">
              Cómo funciona el token, qué sigue del subyacente y qué derechos no entrega.
            </span>
          </Link>
        </li>
        {compare ? (
          <li>
            <Link
              href={compare.href}
              className="group flex h-full flex-col rounded-2xl border border-border bg-surface-1 p-5 transition hover:border-border-strong hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              <span className="label">Comparación</span>
              <span className="mt-1.5 font-medium text-fg">
                Comparar {asset.name} con {compare.otherName}
              </span>
              <span className="mt-1 text-sm leading-relaxed text-fg-muted">
                Cifras de la SEC lado a lado. Comparar no es recomendar.
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
