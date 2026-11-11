import { COPY_EXAMPLE_DATA } from "@/content/copy-legal";
import { cn } from "@/lib/cn";
import { formatFeedDate } from "@/lib/copy/lag";
import type { FeedHealth } from "@/lib/copy/types";

/**
 * Franja de datos de ejemplo. Sólo aparece cuando el feed servido son los
 * fixtures (desarrollo o cuenta demo); en producción con datos reales no se
 * renderiza. El texto vive en `content/copy-legal.ts`.
 */
export function ExampleDataStrip({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-xl border border-dashed border-border-strong bg-surface-1 px-3.5 py-2 text-xs leading-relaxed text-fg-muted",
        className,
      )}
    >
      {COPY_EXAMPLE_DATA}
    </p>
  );
}

function feedDate(health: FeedHealth): string | null {
  return health.generatedAt ? formatFeedDate(health.generatedAt) : null;
}

/**
 * Aviso de feed viejo. La información se sigue mostrando; lo que cambia es que
 * copiar queda desactivado cuando el dato venció o no pasó la verificación.
 */
export function FeedBanner({
  health,
  className,
}: {
  health: FeedHealth;
  className?: string;
}) {
  if (health.state === "expired" || health.state === "invalid") {
    const date = feedDate(health);
    return (
      <div
        className={cn(
          "rounded-xl border border-down/25 bg-down-bg px-3.5 py-3 text-xs leading-relaxed text-down sm:text-sm",
          className,
        )}
      >
        {date
          ? `Los datos de Fraccion.si no se actualizan desde el ${date}. Puedes revisar las carteras, pero copiar está desactivado.`
          : "Los datos de Fraccion.si no pasaron la verificación o están vencidos. Puedes revisar las carteras, pero copiar está desactivado."}
      </div>
    );
  }

  if (health.state === "stale" || health.status === "parcial") {
    const date = feedDate(health);
    return (
      <div
        className={cn(
          "rounded-xl border border-warn/30 bg-warn-bg px-3.5 py-3 text-xs leading-relaxed text-warn sm:text-sm",
          className,
        )}
      >
        {date
          ? `Datos de Fraccion.si al ${date}. La actualización está atrasada.`
          : "Los datos de Fraccion.si están atrasados."}
      </div>
    );
  }

  return null;
}
