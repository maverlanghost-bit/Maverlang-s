import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        /* D1: con `prefers-reduced-motion` el pulso no debe existir. */
        "motion-safe:animate-pulse motion-reduce:animate-none rounded-md bg-surface-3",
        className,
      )}
      {...props}
    />
  );
}
