import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Estado vacío como contenido (D2): sin caja, sin fondo propio ni sombra.
 * Una sola columna de lectura, aire medido y un único paso siguiente.
 * `media` se respeta tal cual (las ilustraciones ya traen su tamaño); `icon`
 * es el atajo para el trazo del sistema.
 */
export function EmptyState({
  title,
  description,
  action,
  media,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  media?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 py-10 text-center sm:py-14", className)}>
      {media ??
        (icon ? (
          <span aria-hidden className="flex size-10 items-center justify-center text-fg-muted [&_svg]:size-5">
            {icon}
          </span>
        ) : null)}
      <div className="flex max-w-md flex-col gap-2">
        <p className="text-[17px] leading-snug font-medium tracking-tight text-balance text-fg">{title}</p>
        {description ? (
          <p className="text-sm leading-relaxed text-pretty text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="mt-1 flex w-full flex-col items-center [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center sm:w-auto">
          {action}
        </div>
      ) : null}
    </div>
  );
}
