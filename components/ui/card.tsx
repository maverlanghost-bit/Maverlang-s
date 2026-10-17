import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-surface-1 p-6 shadow-card transition-colors md:p-8",
        className,
      )}
      {...props}
    />
  );
}
