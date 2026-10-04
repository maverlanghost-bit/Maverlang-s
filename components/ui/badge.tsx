import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const toneClass = {
  neutral: "bg-surface-2 text-fg-body",
  up: "bg-up-bg text-up",
  down: "bg-down-bg text-down",
  warn: "bg-warn-bg text-warn",
  brand: "bg-brand text-fg",
} as const;

export type BadgeTone = keyof typeof toneClass;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
