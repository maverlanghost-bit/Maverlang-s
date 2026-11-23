"use client";

import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/**
 * Progreso vivo de la ejecución de una orden en Solana. Tres pasos:
 * firma en la billetera → ruteo vía Jupiter → confirmación on-chain.
 * El contenedor es el `role="status"` que anuncia el texto de accesibilidad
 * (`signingLabel` / `submittingLabel`) que llega por props.
 *
 * Vertical y de alto fijo: el paso activo se destaca con un fondo suave y un
 * anillo que gira; la línea que une los pasos se llena al avanzar. Ningún paso
 * cambia de tamaño, así nada salta al pasar de uno a otro.
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
    <div role="status" aria-live="polite" className="flex w-full min-w-0 flex-col gap-4">
      <p className="label">{isEnglish ? "Executing order" : "Ejecutando orden"}</p>

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const isDone = step.state === "done";
          const isActive = step.state === "active";
          const isLast = index === steps.length - 1;
          return (
            <li
              key={step.title}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3.5 rounded-2xl px-3 py-3.5 transition-colors duration-500 motion-reduce:transition-none",
                isActive && "bg-surface-1",
              )}
            >
              {!isLast ? (
                <span aria-hidden="true" className="absolute top-[2.5rem] -bottom-3.5 left-[1.4375rem] w-0.5 overflow-hidden rounded-full bg-border">
                  <span
                    className={cn(
                      "block w-full bg-fg transition-[height] duration-700 ease-out motion-reduce:transition-none",
                      isDone ? "h-full" : "h-0",
                    )}
                  />
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 mt-px grid size-6 place-items-center rounded-full transition-colors duration-500 motion-reduce:transition-none",
                  isDone && "bg-fg text-bg",
                  isActive && "bg-bg text-fg",
                  step.state === "waiting" && "bg-surface-2 text-fg-muted",
                )}
              >
                {isDone ? (
                  <IconCheck className="size-3.5" />
                ) : isActive ? (
                  <>
                    <span className="absolute inset-0 rounded-full border-2 border-border" />
                    <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-fg motion-safe:animate-spin motion-reduce:border-fg" />
                    <span className="size-1.5 rounded-full bg-fg" />
                  </>
                ) : (
                  <span className="num text-[11px] leading-none font-medium">{index + 1}</span>
                )}
              </span>

              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm leading-6 text-balance transition-colors duration-500 motion-reduce:transition-none",
                    isActive ? "font-medium text-fg" : isDone ? "font-medium text-fg-body" : "text-fg-muted",
                  )}
                >
                  {step.title}
                </p>
                <p className={cn("mt-0.5 text-[13px] leading-relaxed", isActive ? "text-fg-body" : "text-fg-muted")}>
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="px-3 text-[13px] leading-relaxed text-balance text-fg-muted">
        {isSigning ? signingLabel : submittingLabel}
      </p>
    </div>
  );
}
