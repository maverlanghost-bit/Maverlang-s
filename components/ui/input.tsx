import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-[#767676] bg-surface-2 px-3 text-base text-fg transition duration-[140ms] ease-spring placeholder:text-fg-subtle focus-visible:border-fg disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
