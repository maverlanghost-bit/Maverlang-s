import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        /* Un solo filo, y del token de borde: `border-border` dibuja el
           hairline (#e6e6e6, 1,25:1) dentro del box. Antes era
           `border-transparent` + `shadow-card`, que se rompía de dos formas:
           quien pasaba `border-*` (p. ej. `border-border` en el detalle)
           sumaba una segunda línea de 1px, y quien pasaba otra sombra
           (`shadow-float` en onboarding) perdía el filo entero, porque
           tailwind-merge reemplaza `shadow-card`. Ahora el borde no depende
           de la sombra. Radio xl: la misma curva que diálogos y popovers. */
        "rounded-xl border border-border bg-surface-1 p-6 transition-colors md:p-8",
        className,
      )}
      {...props}
    />
  );
}
