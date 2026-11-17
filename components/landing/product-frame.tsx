import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Marco que presenta una pieza de interfaz como producto (T70). Es el único
 * lugar del marketing con sombra (`shadow-frame`), además del hairline.
 * - `window`: barra superior con tres puntos y un rótulo (escritorio).
 * - `phone`: proporción y radio de teléfono, sin simular un modelo concreto.
 * - `plain`: sólo borde, radio y sombra.
 * El contenido es decorativo cuando repite datos ya presentes en la página:
 * en ese caso pasar `decorative` para sacarlo del árbol de accesibilidad.
 */
export function ProductFrame({
  children,
  variant = "window",
  label,
  decorative = false,
  className,
  bodyClassName,
}: {
  children: ReactNode;
  variant?: "window" | "phone" | "plain";
  /** Texto de la barra (p. ej. la ruta de la app). Sólo en `window`. */
  label?: string;
  decorative?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      aria-hidden={decorative || undefined}
      inert={decorative || undefined}
      className={cn(
        "min-w-0 overflow-hidden border border-border bg-bg shadow-frame",
        variant === "phone" ? "mx-auto w-full max-w-[22rem] rounded-[2rem]" : "rounded-3xl",
        className,
      )}
    >
      {variant === "window" ? (
        <div className="flex h-10 items-center gap-3 border-b border-border bg-surface-1 px-4">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
          </span>
          {label ? (
            <span className="num min-w-0 truncate text-xs text-fg-muted">{label}</span>
          ) : null}
        </div>
      ) : null}
      {variant === "phone" ? (
        <div aria-hidden className="flex justify-center pt-3">
          <span className="h-1.5 w-16 rounded-full bg-surface-3" />
        </div>
      ) : null}
      <div className={cn(variant === "phone" ? "p-5" : "p-5 md:p-6", bodyClassName)}>{children}</div>
    </div>
  );
}
