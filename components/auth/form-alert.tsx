import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Aviso de formulario: un solo bloque para todos los flujos de acceso.
 * `error` usa el relleno semántico del sistema sin borde ni sombra; `info`
 * queda en la superficie neutra. Nunca dentro de otra tarjeta.
 */
export function FormAlert({
  tone = "error",
  className,
  children,
}: {
  tone?: "error" | "info";
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-4 rounded-lg px-3 py-2.5 text-sm leading-relaxed break-words text-pretty",
        tone === "error" ? "bg-down-bg text-down" : "bg-surface-2 text-fg-body",
        className,
      )}
    >
      {children}
    </p>
  );
}
