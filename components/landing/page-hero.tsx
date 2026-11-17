import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Cabecera de página interna (T70). Texto a la izquierda y, si se entrega
 * `aside`, una pieza visual a la derecha que ocupa la mitad que antes quedaba
 * vacía. Sin `aside` el texto usa una medida de lectura cómoda.
 * - `facts`: los datos cortos que antes iban en una línea con puntos medios.
 * - `actions`: botones o enlaces (los entrega la página).
 * - `breadcrumb`: migas, encima del rótulo.
 */
export function PageHero({
  titleId,
  eyebrow,
  title,
  children,
  facts,
  factsLabel,
  actions,
  aside,
  breadcrumb,
  className,
}: {
  titleId: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  facts?: readonly ReactNode[];
  factsLabel?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn("border-b border-border px-5 pt-10 pb-12 md:pt-14 md:pb-16", className)}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl gap-10",
          aside && "lg:grid-cols-12 lg:items-center lg:gap-12",
        )}
      >
        <div className={cn("min-w-0", aside ? "lg:col-span-6" : "max-w-3xl")}>
          {breadcrumb ? <div className="mb-5">{breadcrumb}</div> : null}
          {eyebrow ? <p className="label">{eyebrow}</p> : null}
          {/* `text-title` fuera de `cn`: tailwind-merge lo confunde con un color. */}
          <h1 id={titleId} className={`text-title text-balance ${eyebrow ? "mt-4" : ""}`}>
            {title}
          </h1>
          {children ? (
            <div className="mt-5 max-w-[60ch] text-lead text-pretty text-fg-body">{children}</div>
          ) : null}
          {facts && facts.length > 0 ? (
            <ul aria-label={factsLabel} className="mt-6 flex flex-wrap gap-2">
              {facts.map((fact, index) => (
                <li
                  key={index}
                  className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface-1 px-3 text-[13px] leading-none text-fg-body tabular-nums"
                >
                  {fact}
                </li>
              ))}
            </ul>
          ) : null}
          {actions ? (
            <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {actions}
            </div>
          ) : null}
        </div>
        {aside ? <div className="min-w-0 lg:col-span-6">{aside}</div> : null}
      </div>
    </section>
  );
}
