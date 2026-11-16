"use client";

// Adapted from shadcn/ui (MIT), using our tokens and the individual Radix package.
import type { ComponentProps } from "react";
import * as Primitive from "@radix-ui/react-popover";
import { cn } from "@/lib/cn";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;

export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  container,
  ...props
}: ComponentProps<typeof Primitive.Content> & { container?: HTMLElement | null }) {
  return (
    <Primitive.Portal container={container ?? undefined}>
      <Primitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-[150] max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-border bg-bg p-4 text-fg shadow-float outline-none motion-safe:animate-pop-in",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
