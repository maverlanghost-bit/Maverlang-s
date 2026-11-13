import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Separator({
  orientation = "horizontal",
  decorative = true,
  className,
  ...props
}: ComponentProps<"div"> & { orientation?: "horizontal" | "vertical"; decorative?: boolean }) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        /* Mismo token que Card (`border`): una sola línea de 1px en todo el
           sistema. `shrink-0` evita que el separador vertical colapse a 0px
           dentro de un flex con contenido ancho. */
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
