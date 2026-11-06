"use client";

import { Badge } from "@/components/ui/badge";
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
    <div
      role="status"
      aria-live="polite"
      className="flex w-full flex-col gap-4 rounded-2xl border border-border/70 bg-surface-1 p-5 text-left shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">
          {isEnglish ? "Executing order" : "Ejecutando orden"}
        </p>
        <p className="num text-xs font-medium tabular-nums text-fg-muted">{progressPct}%</p>
      </div>

      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const isDone = step.state === "done";
          const isActive = step.state === "active";
          // El último paso queda en espera con un pulso tenue hasta la confirmación.
          const isLastWaiting = step.state === "waiting" && index === steps.length - 1;
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors duration-300",
                  isDone && "border-brand bg-brand text-bg",
                  isActive && "border-brand/60 bg-surface-2 text-brand",
                  step.state === "waiting" && "border-border bg-surface-2 text-fg-muted",
                  isLastWaiting && "motion-safe:animate-pulse motion-reduce:animate-none",
                )}
              >
                {isDone ? (
                  <IconCheck className="size-3.5" />
                ) : isActive ? (
                  <span className="size-2 rounded-full bg-brand motion-safe:animate-pulse motion-reduce:animate-none" />
                ) : (
                  index + 1
                )}
              </span>

              <div className="flex min-w-0 flex-col gap-0.5">
                <p
                  className={cn(
                    "text-sm leading-snug font-medium text-balance",
                    step.state === "waiting" ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {step.title}
                </p>
                <p className="text-xs leading-relaxed text-fg-muted">{step.detail}</p>
              </div>

              {isActive ? (
                <Badge tone="neutral" className="ml-auto shrink-0">
                  {isEnglish ? "In progress" : "En curso"}
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="flex items-center gap-2 border-t border-border pt-3 text-sm text-fg-body">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-brand motion-safe:animate-pulse motion-reduce:animate-none"
        />
        <span className="text-balance">{isSigning ? signingLabel : submittingLabel}</span>
      </p>
    </div>
  );
}
