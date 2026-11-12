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

/**
 * Bloque de cobertura. Se muestra también sin acceso: es metadato de la
 * cartera, nunca la composición. Va como filas de dato con hairline, sin
 * cápsulas ni barra de color: el estado se lee en la palabra.
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
    <section aria-labelledby="cobertura-titulo" className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border/70 pb-2.5">
        <h2 id="cobertura-titulo" className="font-mono text-[13px] font-medium tracking-[0.045em] text-fg-muted uppercase">
          Cobertura
        </h2>
        <p className="num text-[15px] leading-5 font-medium tabular-nums text-fg">{portion}</p>
      </div>

      <div aria-hidden className="mt-3 h-px w-full bg-border">
        <div className="h-px bg-fg" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-fg-body">
        Replicas el {portion} del portafolio original.
      </p>

      {typeof mappedCount === "number" && typeof totalCount === "number" && totalCount > 0 ? (
        <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
          {mappedCount} de {totalCount}{" "}
          {totalCount === 1 ? "posición se puede comprar" : "posiciones se pueden comprar"} en Maverlang.
        </p>
      ) : null}

      {level === "partial" ? (
        <p className="mt-2 text-[13px] leading-relaxed text-warn">
          Réplica parcial: parte de la cartera no está en Maverlang y el peso disponible se reparte entre lo que
          sí se puede comprar.
        </p>
      ) : null}

      {level === "low" ? (
        <p className="mt-2 text-[13px] leading-relaxed text-warn">
          Esta cartera no se puede replicar bien en Maverlang.
        </p>
      ) : null}
    </section>
  );
}
