import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-base text-fg outline-none transition duration-[140ms] ease-spring placeholder:text-fg-subtle focus:border-border-strong focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
