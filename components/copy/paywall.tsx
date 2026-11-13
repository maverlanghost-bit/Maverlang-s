import Link from "next/link";

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
 * composición: lo único que muestra son filas inventadas.
 *
 * Sin cáscara ni sombra: entra como una sección más, con hairline y el estado
 * dicho con palabras. El precio y la prueba se leen como datos, no como
 * insignias.
 */
export function Paywall({
  title = "Desbloquea",
  description = "Con Copiar carteras ves la composición completa, los movimientos y puedes replicar la mezcla en tu cuenta.",
  className,
  compact = false,
}: {
  title?: string;
  description?: string;
  className?: string;
  /** En la ficha el CTA primario vive en la tarjeta lateral: acá sólo va la vista previa. */
  compact?: boolean;
}) {
  return (
    <section
      aria-labelledby="paywall-titulo"
      className={cn("flex min-w-0 flex-col gap-6 border-t border-border pt-8", className)}
    >
      <div className="flex flex-col gap-2">
        <h2 id="paywall-titulo" className="text-lg font-medium tracking-tight text-fg">
          {title}
        </h2>
        <p className="max-w-prose text-[15px] leading-6 text-fg-body">{description}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div aria-hidden className="flex select-none flex-col gap-2">
          <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-subtle uppercase">
            Vista previa
          </p>
          <ul className="flex flex-col border-t border-border/70">
            {PREVIEW_ROWS.map((row) => (
              <li
                key={row.symbol}
                className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5"
              >
                <span className="min-w-0 text-[13px] leading-5 text-fg-muted">{row.symbol}</span>
                <span className="num shrink-0 text-[13px] leading-5 tabular-nums text-fg">
                  {formatPortion(row.weight / 100)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-prose text-[13px] leading-5 text-fg-muted">
          La vista previa usa datos inventados de ejemplo; no es la composición de esta cartera.
        </p>
      </div>

      {compact ? null : (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col border-t border-border/70">
            <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5">
              <dt className="text-[13px] leading-5 text-fg-muted">Mensual</dt>
              <dd className="num shrink-0 text-[13px] leading-5 font-medium tabular-nums text-fg">
                {formatClp(COPY_PLANS.monthly.clp)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5">
              <dt className="text-[13px] leading-5 text-fg-muted">Anual</dt>
              <dd className="num shrink-0 text-[13px] leading-5 font-medium tabular-nums text-fg">
                {formatClp(COPY_PLANS.annual.clp)}
              </dd>
            </div>
          </dl>
          <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
            {TRIAL_DAYS} días de prueba gratis, una vez por usuario.
          </p>
          <Link
            href="/app/copiar/planes"
            className={buttonClasses({
              variant: "primary",
              size: "lg",
              className: "min-h-12 w-full sm:w-auto",
            })}
          >
            Ver planes
          </Link>
        </div>
      )}

      <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">{COPY_LEGAL_PENDING_LABEL}</p>
    </section>
  );
}
