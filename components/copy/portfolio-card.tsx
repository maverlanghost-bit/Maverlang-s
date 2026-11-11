import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatFeedDate, type LagChip } from "@/lib/copy/lag";
import { type CopyCoverage, type CopyFamily, isCopyableFamily } from "@/lib/copy/types";

import { COPY_FAMILY_LABELS } from "./family-tabs";
import { FraccionSeal } from "./fraccion-seal";

/** Metadatos mínimos que muestra la tarjeta (vienen del índice firmado). */
export type PortfolioCardData = {
  slug: string;
  name: string;
  manager: string;
  family: CopyFamily;
  asOf: string;
  isFrozen: boolean;
  coverage: CopyCoverage;
};

const lagTone: Record<LagChip["tone"], BadgeTone> = {
  neutral: "neutral",
  amber: "warn",
  red: "down",
};

/**
 * Tarjeta del catálogo: nombre, gestor, fecha del dato, chip de atraso,
 * cobertura calculada con el catálogo de Maverlang y el sello de Fraccion.si.
 * Toda la tarjeta es un enlace a la ficha; el sello vive fuera del enlace.
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
    pct === null ? "text-fg-muted" : pct >= 60 ? "text-fg" : pct >= 40 ? "text-warn" : "text-down";
  const barClass =
    pct === null ? "bg-surface-3" : pct >= 60 ? "bg-fg" : pct >= 40 ? "bg-warn" : "bg-down";
  const top50 = portfolio.coverage === "top50_of_full_book";

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface-1 transition-colors duration-150 hover:bg-surface-2">
      <Link
        href={`/app/copiar/${portfolio.slug}`}
        className="flex flex-1 flex-col gap-3 p-5 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-fg/20"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{COPY_FAMILY_LABELS[portfolio.family]}</Badge>
          <Badge
            tone={lagTone[lag.tone]}
            className="h-auto max-w-full whitespace-normal py-1 text-left leading-snug"
          >
            {lag.label}
          </Badge>
          {mirrorOnly ? <Badge tone="neutral">Solo para mirar</Badge> : null}
          {top50 ? <Badge tone="neutral">Top 50 del libro</Badge> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-base font-medium leading-snug tracking-tight text-fg text-balance">
            {portfolio.name}
          </h3>
          <p className="truncate text-sm text-fg-muted">{portfolio.manager || "Gestor no informado"}</p>
        </div>

        <p className="text-xs text-fg-muted">Dato al {formatFeedDate(portfolio.asOf)}</p>

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
              Cobertura
            </span>
            <span className={cn("font-mono text-sm tabular-nums", coverageClass)}>
              {pct === null ? "—" : `${pct} %`}
            </span>
          </div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct ?? 0}%` }} />
          </div>
          <p className="text-[11px] leading-relaxed text-fg-subtle">
            {pct === null
              ? "Cobertura no disponible"
              : `Replicas el ${pct} % del portafolio original`}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-fg-body">
          Ver cartera
          <span aria-hidden>→</span>
        </span>
      </Link>
      <div className="flex items-center justify-end border-t border-border/70 px-5 py-2">
        <FraccionSeal />
      </div>
    </article>
  );
}
