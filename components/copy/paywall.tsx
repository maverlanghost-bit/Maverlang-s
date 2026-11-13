import Link from "next/link";

import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { buttonClasses } from "@/components/ui/button";
import { COPY_LEGAL_PENDING_LABEL } from "@/content/copy-legal";
import { COPY_PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";
import { formatClp, formatPortion } from "@/lib/format";

/**
 * Vista previa con datos FALSOS fijos: jamás la composición real de quien no
 * tiene acceso. Si cambia el feed, esta lista no cambia.
 */
const PREVIEW_ROWS = [
  { symbol: "Posición 1", weight: 11.2 },
  { symbol: "Posición 2", weight: 9.4 },
  { symbol: "Posición 3", weight: 7.8 },
  { symbol: "Posición 4", weight: 6.1 },
  { symbol: "Posición 5", weight: 4.3 },
] as const;

/**
 * Muro de suscripción (§1.10). Se renderiza en el servidor sin recibir la
 * composición: lo único que muestra son filas inventadas y borrosas.
 */
export function Paywall({
  title = "Desbloquea",
  description = "Con Copiar carteras ves la composición completa, los movimientos y puedes replicar la mezcla en tu cuenta.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="paywall-titulo"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface-1 p-6 md:p-8",
        className,
      )}
    >
      <h2 id="paywall-titulo" className="text-xl font-semibold tracking-tight text-fg">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-body">{description}</p>

      <div className="relative mt-5" aria-hidden>
        <ul className="pointer-events-none flex select-none flex-col gap-2 opacity-80 blur-[4px]">
          {PREVIEW_ROWS.map((row) => (
            <li
              key={row.symbol}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2"
            >
              <span className="font-mono text-sm text-fg">{row.symbol}</span>
              <span className="font-mono text-sm tabular-nums text-fg-body">
                {formatPortion(row.weight / 100)}
              </span>
            </li>
          ))}
        </ul>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-surface-1" />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
        La vista previa usa datos inventados de ejemplo; no es la composición de esta cartera.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/app/copiar/planes" className={buttonClasses({ variant: "primary", size: "md" })}>
          Ver planes
        </Link>
        <p className="font-mono text-sm tabular-nums text-fg-body">
          {formatClp(COPY_PLANS.monthly.clp)} al mes · {formatClp(COPY_PLANS.annual.clp)} al año
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        {TRIAL_DAYS} días de prueba gratis, una vez por usuario.
      </p>

      <p className="mt-4 text-xs text-fg-subtle">{COPY_LEGAL_PENDING_LABEL}</p>
      <div className="mt-3">
        <FraccionSeal />
      </div>
    </section>
  );
}
