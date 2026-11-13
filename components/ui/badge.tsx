import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const toneClass = {
  // Hairline propio: sobre `surface-2` (hover de fila, cards) el relleno solo se perdía.
  neutral: "bg-surface-2 text-fg-body ring-1 ring-inset ring-border",
  up: "bg-up-bg text-up",
  down: "bg-down-bg text-down",
  warn: "bg-warn-bg text-warn",
  brand: "bg-fg text-white",
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 align-middle text-xs font-medium tracking-[0.01em] whitespace-nowrap tabular-nums",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
