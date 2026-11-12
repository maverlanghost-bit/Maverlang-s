import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        /* text-base (16 px) evita el zoom automático de iOS; 44 px de alto táctil.
           El contorno usa `border-control` (3,74:1) y el placeholder `fg-muted`
           (5,7:1 sobre surface-2), no `fg-subtle` que se queda en 4,0:1. */
        "h-11 w-full rounded-md border border-control bg-surface-2 px-3 text-base text-fg transition duration-[140ms] ease-spring placeholder:text-fg-muted focus-visible:border-fg disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
