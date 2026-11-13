import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const densityClass = {
  default: "py-14 sm:py-20 lg:py-24",
  /** Para fichas, hubs y legales: menos aire vertical, mismo ancho. */
  compact: "pt-10 pb-16 md:pt-12 md:pb-20",
} as const;

export type LandingSectionDensity = keyof typeof densityClass;

/**
 * Ritmo vertical del marketing (D1). El ancla no lleva `scroll-mt`: el
 * `scroll-padding-top: 4rem` de `html` ya compensa el header fijo.
 */
export function LandingSection({
  id,
  titleId,
  children,
  className,
  density = "default",
}: {
  id?: string;
  titleId: string;
  children: ReactNode;
  className?: string;
  density?: LandingSectionDensity;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("px-5", densityClass[density], className)}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}

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
    <div className="max-w-3xl">
      <h2 id={id} className="text-[1.75rem] leading-[1.15] text-balance sm:text-[2.125rem]">
        {title}
      </h2>
      {/* Entradilla: una sola medida de lectura para todo el sitio. */}
      <p className="mt-4 max-w-[62ch] text-lead text-fg-body">{children}</p>
    </div>
  );
}
