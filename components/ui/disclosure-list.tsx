import type { ReactNode } from "react";
import { IconChevron } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type DisclosureItem = {
  /** Sólo para la key de React; el `<details>` no necesita id. */
  id?: string;
  title: ReactNode;
  content: ReactNode;
  /** Abierto de entrada. Sin esto, cerrado. */
  defaultOpen?: boolean;
};

/**
 * Lista desplegable sin JavaScript (D1): un `<details>` por ítem, con el mismo
 * foco y la misma altura táctil que el resto de los controles. Reemplaza los
 * acordeones de cliente en FAQ, ayuda y guías.
 */
export function DisclosureList({
  items,
  className,
  summaryClassName,
}: {
  items: DisclosureItem[];
  className?: string;
  summaryClassName?: string;
}) {
  return (
    <div className={cn("divide-y divide-border border-y border-border", className)}>
      {items.map((item, index) => (
        <details key={item.id ?? index} className="group" open={item.defaultOpen || undefined}>
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-start justify-between gap-4 py-3.5 text-left text-[15px] leading-6 font-medium text-pretty text-fg [&::-webkit-details-marker]:hidden",
              summaryClassName,
            )}
          >
            <span className="min-w-0">{item.title}</span>
            <IconChevron className="disclosure-chevron mt-1 size-4 shrink-0 text-fg-muted transition-transform duration-200 ease-out motion-reduce:transition-none" />
          </summary>
          <div className="pb-4 text-[15px] leading-relaxed text-pretty text-fg-body">{item.content}</div>
        </details>
      ))}
    </div>
  );
}
