import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        /* Altura 44 (min-h-11): la misma escala que Button md y Select; crece con
           el texto si el usuario agranda la letra. text-base (16 px) evita el zoom
           automático de iOS. El contorno usa `border-control` (3,74:1) y el
           placeholder `fg-muted` (5,7:1 sobre surface-2), no `fg-subtle`.
           Foco: anillo 2 px igual que Button/Select + borde `fg`. */
        "min-h-11 w-full rounded-md border border-control bg-surface-2 px-3 text-base text-fg transition duration-[140ms] ease-spring placeholder:text-fg-muted enabled:hover:border-fg/50 focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-down",
        className,
      )}
      {...props}
    />
  );
}
