import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        /* D1: una sola cáscara. El hairline lo dibuja `shadow-card`; sumar
           un `border` visible era un segundo filo de 1,25:1 sobre el mismo
           pixel. El borde queda transparente para que quien pase sólo un
           color (`border-fg/20`, `hover:border-*`) siga teniendo su caja.
           Radio ≤ xl: la misma curva que popovers y diálogos. */
        "rounded-xl border border-transparent bg-surface-1 p-6 shadow-card transition-colors md:p-8",
        className,
      )}
      {...props}
    />
  );
}
