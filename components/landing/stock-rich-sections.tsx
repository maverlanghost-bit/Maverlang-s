import Link from "next/link";

import { PublicAssetCard } from "@/components/landing/public-asset-card";
import { cn } from "@/lib/cn";
import {
  assetsInCategory,
  categoriesFor,
  comparePath,
  COMPARE_PAIRS,
  MIN_CATEGORY_SIZE,
  similarAssets,
} from "@/lib/seo/categories";
import { COMPANY_SNAPSHOT_DATE, type CompanyProfile } from "@/lib/seo/company-profile";
import { stockParagraph } from "@/lib/seo/copy";
import type { PublicAsset } from "@/lib/seo/public-catalog";
import { stockFacts, stockIntro } from "@/lib/seo/stock-copy";

/**
 * Secciones ricas de la ficha pública (`/acciones/[slug]`).
 *
 * Todo el contenido sale del snapshot de la SEC (`company-profile`) y de las
 * categorías derivadas del catálogo: no hay cifras escritas a mano. Cuando un
 * dato no existe (`null`) simplemente no se muestra.
 */

/**
 * Filas label/valor con hairline: el patrón de la ficha para especificaciones y
 * datos de la SEC. Sin tarjetas por celda, como una ficha técnica.
 */
export function StockDataList({
  rows,
  columns = 1,
  className,
}: {
  rows: readonly { label: string; value: string; mono?: boolean }[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "border-t border-border",
        columns === 2 && "sm:grid sm:grid-cols-2 sm:gap-x-10",
        className,
      )}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
        >
          <dt className="text-sm text-fg-muted">{row.label}</dt>
          <dd
            className={cn(
              "min-w-0 text-sm font-medium text-fg sm:text-right",
              row.mono && "num",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

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

const chipLinkClass =
  "inline-flex min-h-11 items-center rounded-full border border-control bg-bg px-3 text-xs font-medium text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-1 sm:min-h-9";

/**
 * Chips a las categorías con página real (>= MIN_CATEGORY_SIZE activos).
 * Van al bloque "Para seguir entendiendo", no al hero: el hero queda en la
 * identidad, el precio y una sola CTA.
 */
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
    <div>
      <p className="text-xs text-fg-muted">Categorías de {asset.name}:</p>
      <ul aria-label={`Categorías de ${asset.name}`} className="mt-2 flex flex-wrap gap-2">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link href={`/categorias/${category.slug}`} className={chipLinkClass}>
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Sobre {nombre}": una sola sección con `stockIntro`. Las notas legales no se
 * mezclan con el texto: viven al final de la ficha (`StockLegalNotes`).
 */
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
      <section aria-labelledby="accion-sobre">
        <h2 id="accion-sobre" className="text-2xl sm:text-3xl">
          Sobre {asset.name}
        </h2>
        <div className="mt-4 max-w-[62ch] space-y-3 text-lead text-fg-body">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      {facts.length > 0 ? (
        <section aria-labelledby="accion-datos-empresa" className="mt-10 border-t border-border pt-8">
          <h2 id="accion-datos-empresa" className="text-2xl sm:text-3xl">
            Datos de la empresa
          </h2>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-fg-muted">
            Cifras reportadas por la empresa a la SEC. Sólo se muestran los datos disponibles.
          </p>
          <StockDataList rows={facts} columns={2} className="mt-5 max-w-3xl" />
          <p className="mt-5 text-xs leading-relaxed text-fg-muted">
            {`Fuente: SEC EDGAR${SNAPSHOT_DATE_LABEL ? `, datos al ${SNAPSHOT_DATE_LABEL}` : ""}.`}
          </p>
          {profile?.sourceUrl ? (
            <a
              href={profile.sourceUrl}
              target="_blank"
              rel="nofollow noopener"
              className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Ver los informes en SEC EDGAR
            </a>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/**
 * Notas legales de la ficha, al final y literales: qué es el token (1:1 contra
 * el subyacente, sin derechos de accionista) y el aviso de saldo ficticio.
 */
export function StockLegalNotes({ asset }: { asset: PublicAsset }) {
  return (
    <section aria-labelledby="accion-notas-legales" className="mt-14 border-t border-border pt-6">
      <h2 id="accion-notas-legales" className="label">
        Notas legales
      </h2>
      <div className="mt-3 max-w-[68ch] space-y-2 text-xs leading-relaxed text-fg-muted">
        <p>{stockParagraph(asset)}</p>
        <p>
          El token se emite 1:1 contra el subyacente listado en EE.UU. y se mueve en Solana (SPL): el precio
          sigue al de {asset.name}, pero no te convierte en accionista ni da derecho a voto. La demo usa saldo
          ficticio, así que ninguna orden mueve dinero real.
        </p>
      </div>
    </section>
  );
}

/** FAQ de la ficha con `<details>` nativos (sin JavaScript). */
export function StockFaqSection({ items }: { items: readonly { question: string; answer: string }[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="accion-preguntas" className="mt-14">
      <h2 id="accion-preguntas" className="text-2xl sm:text-3xl">
        Preguntas frecuentes
      </h2>
      <div className="mt-5 max-w-3xl divide-y divide-border border-y border-border">
        {items.map((item) => (
          <details key={item.question} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
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
      <h2 id="accion-parecidas" className="text-2xl sm:text-3xl">
        Acciones parecidas
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
        Otras fichas del mismo sector. Es información para comparar, no una recomendación.
      </p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((item) => (
          <li key={item.slug}>
            <PublicAssetCard asset={item} variant="card" />
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

const learnCardClass =
  "group flex h-full flex-col rounded-xl bg-surface-1 p-5 transition hover:bg-surface-2";

/** Enlaces educativos: guía base, comparación con un par y categorías del activo. */
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
      <h2 id="accion-aprender" className="text-2xl sm:text-3xl">
        Para seguir entendiendo
      </h2>
      <ul className="mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
        <li>
          <Link href="/guias/que-es-una-accion-tokenizada" className={learnCardClass}>
            <span className="label">Guía</span>
            <span className="mt-1.5 font-medium text-fg">Qué es una acción tokenizada</span>
            <span className="mt-1 text-sm leading-relaxed text-fg-muted">
              Cómo funciona el token, qué sigue del subyacente y qué derechos no entrega.
            </span>
          </Link>
        </li>
        {compare ? (
          <li>
            <Link href={compare.href} className={learnCardClass}>
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

      <div className="mt-6 max-w-4xl">
        <StockCategoryChips asset={asset} assets={assets} />
      </div>
    </section>
  );
}
