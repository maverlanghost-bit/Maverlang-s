import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        /* D1: con `prefers-reduced-motion` el pulso no debe existir.
           El tono es `surface-2`: sobre blanco se lee como ausencia de
           contenido, no como un destello. Radio `xs`: una línea de texto no
           es una píldora; los consumidores pasan `rounded-full` al avatar. */
        "motion-safe:animate-pulse motion-reduce:animate-none rounded-xs bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}
