import Link from "next/link";

import { COPY_FAMILY_LABELS } from "@/components/copy/family-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CopyFamily } from "@/lib/copy/types";

/** Lo que la página ya calculó por cada cartera seguida. Todo serializable. */
export type FollowCard = {
  slug: string;
  name: string;
  manager: string;
  family: CopyFamily | null;
  asOfLabel: string;
  copiedVersionId: string;
  currentVersionId: string;
  /** Algún peso se movió más de 2 puntos respecto de la versión copiada. */
  moved: boolean;
  /** `false` si no guardamos los pesos de la versión copiada: no se puede medir el cambio. */
  weightsKnown: boolean;
  /** `true` si la composición actual ya no está en el feed. */
  missing: boolean;
  example: boolean;
};

function shortVersion(versionId: string): string {
  if (!versionId) return "sin versión registrada";
  return versionId.length > 14 ? `${versionId.slice(0, 14)}…` : versionId;
}

/**
 * Carteras que la persona sigue. La versión copiada se compara con la actual:
 * si algún peso se movió más de 2 puntos aparece «La cartera cambió» y
 * «Revisar ajuste», que solo abre la mezcla para armar un plan NUEVO.
 * En F1 nada se rebalancea solo.
 */
export function FollowList({ items }: { items: FollowCard[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const versionChanged = item.copiedVersionId.length > 0 && item.copiedVersionId !== item.currentVersionId;
        const review = item.moved && versionChanged && !item.missing;
        return (
          <li
            key={item.slug}
            className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-4 shadow-card sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-fg">{item.name}</p>
                <p className="truncate text-sm text-fg-muted">
                  {[item.manager, item.family ? COPY_FAMILY_LABELS[item.family] : "Cartera", item.asOfLabel ? `Dato al ${item.asOfLabel}` : null]
                    .filter((part): part is string => typeof part === "string" && part.length > 0)
                    .join(" · ")}
                </p>
              </div>
              {review ? <Badge tone="warn">La cartera cambió</Badge> : null}
            </div>

            <dl className="grid gap-1 text-xs text-fg-muted tabular-nums sm:grid-cols-2">
              <div className="flex items-baseline gap-2">
                <dt>Copiada:</dt>
                <dd className="truncate font-medium text-fg-body">{shortVersion(item.copiedVersionId)}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt>Actual:</dt>
                <dd className="truncate font-medium text-fg-body">{shortVersion(item.currentVersionId)}</dd>
              </div>
            </dl>

            {item.missing ? (
              <p className="text-sm leading-relaxed text-fg-muted">
                Esta cartera ya no está en el feed de Fraccion.si. Dejamos de mostrar su comparación.
              </p>
            ) : !item.copiedVersionId ? (
              <p className="text-sm leading-relaxed text-fg-muted">
                No tenemos registrada la versión que copiaste. Vuelve a copiarla para empezar a comparar.
              </p>
            ) : versionChanged && !item.weightsKnown ? (
              <p className="text-sm leading-relaxed text-fg-muted">
                La versión cambió. No guardamos los pesos de la versión que copiaste, así que no podemos medir cuánto se
                movió.
              </p>
            ) : review ? (
              <div className="flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn-bg/60 p-3">
                <p className="text-sm leading-relaxed text-warn">
                  La cartera cambió: algún peso se movió más de 2 puntos desde la versión que copiaste. Puedes revisar un
                  ajuste con la composición de hoy.
                </p>
                <Button asChild variant="secondary" size="lg" className="min-h-12 w-full touch-manipulation sm:w-fit">
                  <Link href={`/app/copiar/${encodeURIComponent(item.slug)}/mezcla?ajuste=1`}>Revisar ajuste</Link>
                </Button>
              </div>
            ) : versionChanged ? (
              <p className="text-sm leading-relaxed text-fg-muted">
                La versión cambió, pero ningún peso se movió más de 2 puntos. No hace falta ajustar nada.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-fg-muted">Estás al día con la última versión.</p>
            )}

            {item.example ? (
              <p className="text-xs leading-relaxed text-warn">Datos de ejemplo, no reales.</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="ghost" size="lg" className="min-h-12 touch-manipulation">
                <Link href={`/app/copiar/${encodeURIComponent(item.slug)}`}>Ver cartera</Link>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
