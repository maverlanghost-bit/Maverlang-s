import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const densityClass = {
  default: "py-16 sm:py-20 lg:py-28",
  /** Para fichas, hubs y legales: menos aire vertical, mismo ancho. */
  compact: "pt-10 pb-16 md:pt-12 md:pb-20",
} as const;

export type LandingSectionDensity = keyof typeof densityClass;

const toneClass = {
  default: "",
  /** Franja gris: separa dos secciones blancas sin dibujar una línea. */
  muted: "border-y border-border bg-surface-1",
  /** Banda invertida. Una sola por página. */
  inverse: "bg-fg text-white",
} as const;

export type LandingSectionTone = keyof typeof toneClass;

/**
 * Ritmo vertical del marketing (D1). El ancla no lleva `scroll-mt`: el
 * `scroll-padding-top: 4rem` de `html` ya compensa el header fijo.
 * T70: ancho `max-w-6xl` y tres tonos de superficie.
 */
export function LandingSection({
  id,
  titleId,
  children,
  className,
  density = "default",
  tone = "default",
}: {
  id?: string;
  titleId: string;
  children: ReactNode;
  className?: string;
  density?: LandingSectionDensity;
  tone?: LandingSectionTone;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("px-5", densityClass[density], toneClass[tone], className)}
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/**
 * Encabezado de sección (T70).
 * - `left`: título y entradilla a la izquierda (lectura).
 * - `center`: centrado, para secciones que abren con una pieza visual.
 * - `split`: título a la izquierda y entradilla a la derecha en escritorio;
 *   ocupa el ancho completo en vez de dejar media caja vacía.
 * `inverse` adapta los colores a la banda de fondo negro.
 */
export function SectionHeader({
  id,
  eyebrow,
  title,
  children,
  align = "left",
  inverse = false,
  as: Heading = "h2",
  className,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "left" | "center" | "split";
  inverse?: boolean;
  as?: "h1" | "h2";
  className?: string;
}) {
  const heading = (
    <>
      {eyebrow ? (
        <p className={cn("label mb-4", inverse && "text-inverse-muted")}>{eyebrow}</p>
      ) : null}
      {/* `text-title` va fuera de `cn`: tailwind-merge lo toma por un color y lo
          descarta si después viene `text-white`. */}
      <Heading id={id} className={`text-title text-balance ${inverse ? "text-white" : ""}`}>
        {title}
      </Heading>
    </>
  );
  const lead = children ? (
    <p className={`max-w-[60ch] text-lead text-pretty ${inverse ? "text-inverse-muted" : "text-fg-body"}`}>
      {children}
    </p>
  ) : null;

  if (align === "split") {
    return (
      <div
        className={cn(
          "grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-10",
          className,
        )}
      >
        <div className="lg:col-span-7">{heading}</div>
        {lead ? <div className="lg:col-span-5 lg:pb-1">{lead}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        align === "center" ? "mx-auto flex max-w-3xl flex-col items-center text-center" : "max-w-3xl",
        className,
      )}
    >
      {heading}
      {lead ? <div className="mt-5">{lead}</div> : null}
    </div>
  );
}

/** Compatibilidad: las páginas que ya usan `SectionIntro` reciben la escala nueva. */
export function SectionIntro({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <SectionHeader id={id} title={title}>
      {children}
    </SectionHeader>
  );
}
