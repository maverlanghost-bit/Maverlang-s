import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Cáscara única de estado vacío (D1): misma caja que `ErrorState` y que los
 * paneles de contenido. `media` se respeta tal cual (las ilustraciones del
 * producto ya traen su propio tamaño); `icon` es el atajo para el disco de
 * 40 px del sistema.
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
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-3xl bg-surface-1 px-6 py-10 text-center",
        className,
      )}
    >
      {media ??
        (icon ? (
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-muted [&_svg]:size-5"
          >
            {icon}
          </span>
        ) : null)}
      <p className="text-base font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      {action ?? null}
    </div>
  );
}
