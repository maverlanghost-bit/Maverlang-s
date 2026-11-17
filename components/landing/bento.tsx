import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Grilla bento (T70). Seis columnas en escritorio para poder mezclar tarjetas
 * de 2, 3, 4 y 6 de ancho; una columna en móvil. El ancho de cada tarjeta se
 * pasa por `className` (`lg:col-span-3`, `lg:row-span-2`…).
 */
export function BentoGrid({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul";
}) {
  return (
    <Tag className={cn("grid list-none grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-6", className)}>
      {children}
    </Tag>
  );
}

const cardTone = {
  /** Tarjeta blanca con hairline: contenido de producto. */
  plain: "border-border bg-bg",
  /** Tarjeta gris: argumento o dato de apoyo. */
  muted: "border-border bg-surface-1",
  /** Tarjeta negra: un único énfasis por grilla. */
  inverse: "border-transparent bg-fg text-white",
  /** Sobre la banda invertida. */
  onInverse: "border-inverse-border bg-inverse-surface text-white",
} as const;

export type BentoTone = keyof typeof cardTone;

/**
 * Tarjeta bento: rótulo, título, texto y un hueco para la pieza visual.
 * `visual` va abajo por defecto y arriba con `visualFirst`. Sin `title`, la
 * tarjeta es sólo contenedor (p. ej. una pieza de interfaz que trae su propio
 * encabezado).
 */
export function BentoCard({
  eyebrow,
  title,
  children,
  visual,
  visualFirst = false,
  tone = "plain",
  as: Tag = "div",
  headingLevel: Heading = "h3",
  padded = true,
  className,
}: {
  eyebrow?: string;
  title?: ReactNode;
  children?: ReactNode;
  visual?: ReactNode;
  visualFirst?: boolean;
  tone?: BentoTone;
  as?: "div" | "li" | "article";
  headingLevel?: "h2" | "h3" | "h4";
  padded?: boolean;
  className?: string;
}) {
  const dark = tone === "inverse" || tone === "onInverse";
  const text =
    title || children || eyebrow ? (
      <div className="min-w-0">
        {eyebrow ? <p className={cn("label mb-3", dark && "text-inverse-muted")}>{eyebrow}</p> : null}
        {title ? (
          <Heading
            className={cn(
              "text-lg leading-snug font-semibold tracking-tight text-pretty",
              dark && "text-white",
            )}
          >
            {title}
          </Heading>
        ) : null}
        {children ? (
          <div
            className={cn(
              "text-[15px] leading-relaxed text-pretty",
              title && "mt-2",
              dark ? "text-inverse-muted" : "text-fg-muted",
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <Tag
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-bento border",
        padded && "gap-6 p-6 md:p-7",
        cardTone[tone],
        className,
      )}
    >
      {visualFirst ? visual : text}
      {visualFirst ? text : visual ? <div className="mt-auto min-w-0">{visual}</div> : null}
    </Tag>
  );
}
