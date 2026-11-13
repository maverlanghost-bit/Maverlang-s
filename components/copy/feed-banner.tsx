import { COPY_EXAMPLE_DATA } from "@/content/copy-legal";
import { cn } from "@/lib/cn";
import { formatFeedDate } from "@/lib/copy/lag";
import type { FeedHealth } from "@/lib/copy/types";

/**
 * Franja de datos de ejemplo. Sólo aparece cuando el feed servido son los
 * fixtures (desarrollo o cuenta demo); en producción con datos reales no se
 * renderiza. El texto vive en `content/copy-legal.ts`.
 *
 * Una línea con hairline a la izquierda: se lee como nota del dato, no como
 * una cápsula de aviso.
 */
export function ExampleDataStrip({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex min-h-11 min-w-0 items-center border-l border-border pl-3 text-[13px] leading-5 text-pretty text-fg-muted",
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

/** La fecha del dato, en mono y sin saltos: se lee como un valor, no como prosa. */
function FeedDate({ value }: { value: string }) {
  return <span className="num font-medium whitespace-nowrap text-fg">{value}</span>;
}

/**
 * Aviso de feed viejo. La información se sigue mostrando; lo que cambia es que
 * copiar queda desactivado cuando el dato venció o no pasó la verificación.
 *
 * Una sola línea, 13px y sin fondo de color: la fecha manda y el estado se
 * dice con palabras.
 */
export function FeedBanner({
  health,
  className,
}: {
  health: FeedHealth;
  className?: string;
}) {
  const line = cn(
    "min-h-11 min-w-0 border-t border-border pt-3 text-[13px] leading-5 text-pretty text-fg-body",
    className,
  );

  if (health.state === "expired" || health.state === "invalid") {
    const date = feedDate(health);
    return (
      <p className={line}>
        {date ? (
          <>
            Los datos de Fraccion.si no se actualizan desde el <FeedDate value={date} />. Puedes revisar las
            carteras, pero <span className="text-down">copiar está desactivado</span>.
          </>
        ) : (
          <>
            Los datos de Fraccion.si no pasaron la verificación o están vencidos. Puedes revisar las carteras,
            pero <span className="text-down">copiar está desactivado</span>.
          </>
        )}
      </p>
    );
  }

  if (health.state === "stale" || health.status === "parcial") {
    const date = feedDate(health);
    return (
      <p className={line}>
        {date ? (
          <>
            Datos de Fraccion.si al <FeedDate value={date} />.{" "}
            <span className="text-warn">La actualización está atrasada.</span>
          </>
        ) : (
          <span className="text-warn">Los datos de Fraccion.si están atrasados.</span>
        )}
      </p>
    );
  }

  return null;
}
