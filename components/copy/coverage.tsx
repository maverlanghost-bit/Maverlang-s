import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatPortion } from "@/lib/format";

/**
 * Cobertura de la réplica (§1.5): qué parte del portafolio original se puede
 * comprar en Maverlang. Los umbrales son de negocio, no de presentación:
 * ≥60 % normal, 40–60 % «Réplica parcial» y <40 % no se puede copiar.
 */
export const COVERAGE_COPY_MIN = 40;
export const COVERAGE_FULL_MIN = 60;

export type CoverageLevel = "full" | "partial" | "low";

export function coverageLevel(coveragePct: number): CoverageLevel {
  if (!Number.isFinite(coveragePct)) return "low";
  if (coveragePct >= COVERAGE_FULL_MIN) return "full";
  if (coveragePct >= COVERAGE_COPY_MIN) return "partial";
  return "low";
}

/** Peso en porcentaje (0–100) con el formato chileno: `12,4 %`. */
export function formatWeightPct(weight: number): string {
  return formatPortion(weight / 100);
}

const barTone: Record<CoverageLevel, string> = {
  full: "bg-fg",
  partial: "bg-warn",
  low: "bg-down",
};

/**
 * Bloque de cobertura. Se muestra también sin acceso: es metadato de la
 * cartera, nunca la composición.
 */
export function Coverage({
  coveragePct,
  mappedCount,
  totalCount,
  className,
}: {
  coveragePct: number;
  /** Posiciones que se pueden comprar en Maverlang. */
  mappedCount?: number;
  /** Posiciones del portafolio original. */
  totalCount?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(coveragePct) ? coveragePct : 0));
  const level = coverageLevel(pct);
  const portion = formatPortion(pct / 100);

  return (
    <section
      aria-labelledby="cobertura-titulo"
      className={cn("rounded-2xl border border-border/70 bg-surface-1 p-5", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="cobertura-titulo"
          className="text-xs font-medium text-fg-muted"
        >
          Cobertura
        </h2>
        <span className="font-mono text-2xl tabular-nums tracking-tight text-fg">{portion}</span>
      </div>

      <div aria-hidden className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className={cn("h-full rounded-full", barTone[level])} style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-fg-body">
        Cobertura: replicas el {portion} del portafolio original.
      </p>

      {typeof mappedCount === "number" && typeof totalCount === "number" && totalCount > 0 ? (
        <p className="mt-1 text-xs text-fg-muted">
          {mappedCount} de {totalCount}{" "}
          {totalCount === 1 ? "posición se puede comprar" : "posiciones se pueden comprar"} en
          Maverlang.
        </p>
      ) : null}

      {level === "partial" ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <Badge tone="warn" className="self-start">
            Réplica parcial
          </Badge>
          <p className="text-xs leading-relaxed text-fg-muted">
            Parte de la cartera no se puede comprar en Maverlang. El peso disponible se reparte
            entre lo que sí se puede.
          </p>
        </div>
      ) : null}

      {level === "low" ? (
        <p className="mt-3 text-xs leading-relaxed text-down">
          Esta cartera no se puede replicar bien en Maverlang.
        </p>
      ) : null}
    </section>
  );
}
