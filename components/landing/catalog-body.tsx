import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Cuerpo de una página pública del catálogo, bajo el `PageHero` (T70). Mismo
 * ancho y gutter que `LandingSection`, pero sin exigir una región con nombre:
 * el hero ya es la región titulada de la página.
 */
export function CatalogBody({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted";
}) {
  return (
    <div
      className={cn(
        "px-5 pt-10 pb-16 md:pt-12 md:pb-20",
        tone === "muted" && "border-y border-border bg-surface-1",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  );
}
