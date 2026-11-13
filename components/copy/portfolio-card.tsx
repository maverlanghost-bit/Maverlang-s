import Link from "next/link";

import { cn } from "@/lib/cn";
import { daysSince, formatFeedDate, type LagChip } from "@/lib/copy/lag";
import { type CopyCoverage, type CopyFamily, isCopyableFamily } from "@/lib/copy/types";

import { COPY_FAMILY_LABELS } from "./family-tabs";

/** Metadatos mínimos que muestra la fila (vienen del índice firmado). */
export type PortfolioCardData = {
  slug: string;
  name: string;
  manager: string;
  family: CopyFamily;
  asOf: string;
  isFrozen: boolean;
  coverage: CopyCoverage;
};

/**
 * Retícula compartida por la fila y la cabecera de columnas del catálogo.
 * Móvil: nombre y cobertura en el primer renglón, y familia · dato · atraso a
 * todo el ancho en el segundo. Escritorio: cartera · familia · dato · atraso ·
 * cobertura, con las cifras en mono tabular. La columna de cobertura tiene
 * ancho fijo para que las cifras no bailen entre filas.
 */
export const PORTFOLIO_COLUMNS =
  "grid-cols-[minmax(0,1fr)_4.5rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem_4.5rem]";

export const PORTFOLIO_ROW_GRID = cn(
  "grid items-start gap-x-4 gap-y-1.5 md:items-center md:gap-x-4 md:gap-y-0 lg:gap-x-6",
  PORTFOLIO_COLUMNS,
);

export const PORTFOLIO_HEADER_GRID = cn(
  "hidden items-end gap-x-4 border-b border-border pb-2 md:grid lg:gap-x-6",
  PORTFOLIO_COLUMNS,
);

/** «Hoy», «1 día», «12 días» o «Congelada»; nunca promete frescura que no hay. */
export function lagAgeLabel(asOf: string, isFrozen: boolean): string {
  if (isFrozen) return "Congelada";
  const days = daysSince(asOf);
  if (days === null) return "Sin fecha";
  if (days <= 0) return "Hoy";
  return days === 1 ? "1 día" : `${days} días`;
}

function lagToneClass(tone: LagChip["tone"]): string {
  if (tone === "red") return "text-down";
  if (tone === "amber") return "text-warn";
  return "text-fg-muted";
}

/**
 * Fila del catálogo, hairline en vez de tarjeta: nombre y gestor, familia,
 * fecha del dato, atraso y cobertura calculada con el catálogo de Maverlang.
 * Toda la fila es un enlace a la ficha.
 */
export function PortfolioCard({
  portfolio,
  lag,
  coveragePct,
}: {
  portfolio: PortfolioCardData;
  lag: LagChip;
  coveragePct: number | null;
}) {
  const copyable = isCopyableFamily(portfolio.family);
  const mirrorOnly = !copyable || portfolio.isFrozen;
  const pct =
    coveragePct === null ? null : Math.max(0, Math.min(100, Math.round(coveragePct)));
  const coverageClass =
    pct === null ? "text-fg-subtle" : pct >= 60 ? "text-fg" : pct >= 40 ? "text-warn" : "text-down";
  const top50 = portfolio.coverage === "top50_of_full_book";
  const asOf = formatFeedDate(portfolio.asOf);
  const lagLabel = lagAgeLabel(portfolio.asOf, portfolio.isFrozen);
  const lagClass = lagToneClass(lag.tone);
  const subline = [
    portfolio.manager || "Gestor no informado",
    top50 ? "Top 50 del libro" : null,
    mirrorOnly ? "Solo para mirar" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/app/copiar/${portfolio.slug}`}
        className={cn(
          PORTFOLIO_ROW_GRID,
          "-mx-3 px-3 py-4 transition-colors duration-150 ease-spring hover:bg-surface-1 focus-visible:bg-surface-1 md:py-3.5",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[15px] leading-snug font-medium tracking-tight break-words text-pretty text-fg">
            {portfolio.name}
          </span>
          <span className="mt-1 block text-[13px] leading-5 break-words text-pretty text-fg-muted">
            {subline}
          </span>
        </span>

        <span className="hidden text-[13px] leading-5 text-fg-muted md:block">
          {COPY_FAMILY_LABELS[portfolio.family]}
        </span>

        <span className="num hidden text-[13px] leading-5 whitespace-nowrap text-fg-body md:block">
          {asOf || "—"}
        </span>

        <span className={cn("hidden text-[13px] leading-5 whitespace-nowrap md:block", lagClass)}>
          {lagLabel}
        </span>

        <span className="flex min-w-0 flex-col items-end text-right">
          <span className="label-xs block md:hidden">Cobertura</span>
          <span
            className={cn(
              "num block text-[15px] leading-5 font-medium whitespace-nowrap tabular-nums",
              coverageClass,
            )}
          >
            {pct === null ? "—" : `${pct} %`}
          </span>
        </span>

        {/* Segundo renglón móvil: familia, fecha del dato y atraso a todo el
            ancho. Desde md cada dato vuelve a su columna. */}
        <span className="col-span-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-5 text-fg-muted md:hidden">
          <span>{COPY_FAMILY_LABELS[portfolio.family]}</span>
          <span aria-hidden className="text-fg-subtle">
            ·
          </span>
          <span className="num whitespace-nowrap">{asOf || "sin fecha"}</span>
          <span aria-hidden className="text-fg-subtle">
            ·
          </span>
          <span className={cn("whitespace-nowrap", lagClass)}>{lagLabel}</span>
        </span>
      </Link>
    </li>
  );
}
