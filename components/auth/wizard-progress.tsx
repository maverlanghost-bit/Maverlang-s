/**
 * Progreso discreto de los wizards: una línea de texto y una barra de 3 px.
 * Compartido por registro y onboarding para que ambos midan y se lean igual.
 */
export function WizardProgress({ step, total }: { step: number; total: number }) {
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
