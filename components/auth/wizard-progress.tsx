import { cn } from "@/lib/cn";

/**
 * Progreso discreto de los wizards: una línea de texto y una barra de 3 px.
 * Compartido por registro y onboarding para que ambos midan y se lean igual.
 *
 * Con `labels` (un nombre por paso) muestra los pasos con su nombre y deja
 * "Paso N de M" sólo para lectores de pantalla. Sin `labels` se ve como siempre.
 */
export function WizardProgress({
  step,
  total,
  labels,
}: {
  step: number;
  total: number;
  labels?: readonly string[];
}) {
  if (labels && labels.length === total) {
    return (
      <div className="mt-6">
        <p className="sr-only">
          Paso {step} de {total}
        </p>
        <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {labels.map((name, index) => {
            const position = index + 1;
            const current = position === step;
            return (
              <li key={name} aria-current={current ? "step" : undefined} className="min-w-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-[3px] rounded-full transition-colors duration-[240ms] ease-spring motion-reduce:transition-none",
                    position <= step ? "bg-fg" : "bg-surface-3",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 flex items-baseline gap-1.5 text-[13px] leading-snug",
                    current ? "font-medium text-fg" : "text-fg-muted",
                  )}
                >
                  <span className="num shrink-0">{position}</span>
                  <span className="min-w-0 break-words">{name}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="label">
        Paso {step} de {total}
      </p>
      <div
        className="mt-2 h-[3px] overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={`Paso ${step} de ${total}`}
      >
        <div
          className="h-full rounded-full bg-fg transition-[width] duration-[240ms] ease-spring motion-reduce:transition-none"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
