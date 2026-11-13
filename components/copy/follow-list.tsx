import Link from "next/link";

import { COPY_FAMILY_LABELS } from "@/components/copy/family-tabs";
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
  if (!versionId) return "sin versión";
  return versionId.length > 12 ? `${versionId.slice(0, 12)}…` : versionId;
}

/**
 * Estado de la copia, en una línea: qué pasó con la versión y qué se puede
 * hacer. Nunca promete sincronización ni rebalanceo automático.
 */
function stateOf(item: FollowCard): { review: boolean; text: string } {
  const versionChanged =
    item.copiedVersionId.length > 0 && item.copiedVersionId !== item.currentVersionId;
  if (item.missing) {
    return {
      review: false,
      text: "Esta cartera ya no está en el feed de Fraccion.si. Dejamos de mostrar su comparación.",
    };
  }
  if (!item.copiedVersionId) {
    return {
      review: false,
      text: "No tenemos registrada la versión que copiaste. Vuelve a copiarla para empezar a comparar.",
    };
  }
  if (versionChanged && !item.weightsKnown) {
    return {
      review: false,
      text: "La versión cambió. No guardamos los pesos de la versión que copiaste, así que no podemos medir cuánto se movió.",
    };
  }
  if (item.moved && versionChanged) {
    return {
      review: true,
      text: "La cartera cambió: algún peso se movió más de 2 puntos desde la versión que copiaste. Puedes revisar un ajuste con la composición de hoy.",
    };
  }
  if (versionChanged) {
    return {
      review: false,
      text: "La versión cambió, pero ningún peso se movió más de 2 puntos. No hace falta ajustar nada.",
    };
  }
  return { review: false, text: "Estás al día con la última versión." };
}

/**
 * Carteras que la persona sigue, una por fila hairline: nombre, gestor, fecha
 * del dato y el estado de la versión copiada contra la actual. «Revisar
 * ajuste» sólo abre la mezcla para armar un plan NUEVO: en F1 nada se
 * rebalancea solo.
 */
export function FollowList({ items }: { items: FollowCard[] }) {
  return (
    <ul className="border-t border-border">
      {items.map((item) => {
        const state = stateOf(item);
        const meta = [
          item.manager,
          item.family ? COPY_FAMILY_LABELS[item.family] : "Cartera",
          item.asOfLabel ? `Dato al ${item.asOfLabel}` : null,
        ]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(" · ");
        const versionsDiffer =
          item.copiedVersionId.length > 0 && item.copiedVersionId !== item.currentVersionId;

        return (
          <li key={item.slug} className="border-b border-border">
            <div className="grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-8">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {item.missing ? (
                    <span className="text-[15px] leading-tight font-medium tracking-tight text-fg">
                      {item.name}
                    </span>
                  ) : (
                    <Link
                      href={`/app/copiar/${encodeURIComponent(item.slug)}`}
                      className="inline-flex min-h-11 items-center text-[15px] leading-tight font-medium tracking-tight text-fg underline-offset-4 transition-colors duration-150 hover:underline"
                    >
                      {item.name}
                    </Link>
                  )}
                  {state.review ? (
                    <span className="text-[13px] leading-5 font-medium text-warn">
                      La cartera cambió
                    </span>
                  ) : null}
                </div>

                <p className="text-[13px] leading-5 text-fg-muted">{meta}</p>

                <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-fg-body">
                  {state.text}
                </p>

                {versionsDiffer ? (
                  <p className="num mt-1 text-[13px] leading-5 text-fg-muted">
                    Copiada {shortVersion(item.copiedVersionId)} · actual{" "}
                    {shortVersion(item.currentVersionId)}
                  </p>
                ) : null}

                {item.example ? (
                  <p className="mt-1 text-[13px] leading-5 text-warn">
                    Datos de ejemplo, no reales.
                  </p>
                ) : null}
              </div>

              {state.review ? (
                <div className="md:pt-1">
                  <Button
                    asChild
                    variant="secondary"
                    size="md"
                    className="min-h-11 w-full touch-manipulation sm:w-auto"
                  >
                    <Link href={`/app/copiar/${encodeURIComponent(item.slug)}/mezcla?ajuste=1`}>
                      Revisar ajuste
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
