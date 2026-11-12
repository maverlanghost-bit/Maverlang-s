"use client";

import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/**
 * Progreso vivo de la ejecución de una orden en Solana. Tres pasos:
 * firma en la billetera → ruteo vía Jupiter → confirmación on-chain.
 * El contenedor es el `role="status"` que anuncia el texto de accesibilidad
 * (`signingLabel` / `submittingLabel`) que llega por props.
 */
export function TradeExecutionStepper({
  phase,
  signingLabel,
  submittingLabel,
}: {
  phase: "signing" | "submitting";
  signingLabel: string;
  submittingLabel: string;
}) {
  const { language } = useT();
  const isEnglish = language === "en";
  const isSigning = phase === "signing";

  // Progreso aproximado: la firma deja el primer paso cerrado, el ruteo el segundo.
  const progressPct = isSigning ? 33 : 66;

  const steps: readonly {
    title: string;
    detail: string;
    state: "done" | "active" | "waiting";
  }[] = [
    {
      title: isEnglish ? "Sign in your wallet" : "Firma en tu billetera",
      detail: isEnglish
        ? "Approve the order in your wallet app. Nothing is sent yet."
        : "Aprueba la orden en tu app de billetera. Aún no se envía nada.",
      state: isSigning ? "active" : "done",
    },
    {
      title: isEnglish ? "Routing on Solana via Jupiter" : "Enrutando en Solana vía Jupiter",
      detail: isEnglish
        ? "We are looking for the best available route for your order."
        : "Buscamos la mejor ruta disponible para tu orden.",
      state: isSigning ? "waiting" : "active",
    },
    {
      title: isEnglish ? "On-chain confirmation" : "Confirmación on-chain",
      detail: isEnglish
        ? "The network is confirming the transaction on Solana."
        : "La red está confirmando la transacción en Solana.",
      state: "waiting",
    },
  ];

  return (
    <div role="status" aria-live="polite" className="flex w-full min-w-0 flex-col gap-5">
      <div>
        <p className="label">{isEnglish ? "Executing order" : "Ejecutando orden"}</p>
        {/* Barra de actividad, no de porcentaje: no promete un avance exacto. */}
        <div aria-hidden="true" className="mt-3 h-px w-full overflow-hidden bg-border">
          <div
            className="h-full bg-fg transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const isDone = step.state === "done";
          const isActive = step.state === "active";
          const isLastWaiting = step.state === "waiting" && index === steps.length - 1;
          return (
            <li
              key={step.title}
              aria-current={isActive ? "step" : undefined}
              className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3.5 pb-4 last:pb-0"
            >
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-5 bottom-0 left-2.5 w-px bg-border"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 mt-0.5 grid size-5 place-items-center rounded-full border bg-bg transition-colors duration-300",
                  isDone && "border-fg bg-fg text-bg",
                  isActive && "border-fg text-fg",
                  step.state === "waiting" && "border-control",
                  isLastWaiting && "motion-safe:animate-pulse motion-reduce:animate-none",
                )}
              >
                {isDone ? (
                  <IconCheck className="size-3" />
                ) : isActive ? (
                  <span className="size-1.5 rounded-full bg-fg motion-safe:animate-pulse motion-reduce:animate-none" />
                ) : null}
              </span>

              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm leading-5 font-medium text-balance",
                    step.state === "waiting" ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex items-start gap-2.5 border-t border-border pt-4">
        <span
          aria-hidden="true"
          className="mt-[0.4375rem] size-1.5 shrink-0 rounded-full bg-fg motion-safe:animate-pulse motion-reduce:animate-none"
        />
        <p className="text-sm leading-relaxed text-balance text-fg-body">
          {isSigning ? signingLabel : submittingLabel}
        </p>
      </div>
    </div>
  );
}
