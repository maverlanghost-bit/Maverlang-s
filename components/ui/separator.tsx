import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Separator({
  orientation = "horizontal",
  decorative = true,
  className,
  ...props
}: ComponentProps<"div"> & { orientation?: "horizontal" | "vertical"; decorative?: boolean }) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      aria-hidden={decorative ? true : undefined}
      className={cn("bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
      {...props}
    />
  );
}
