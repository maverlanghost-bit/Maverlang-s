"use client";

// Adapted from shadcn/ui (MIT); appearance follows the existing design tokens.
import type { ComponentProps } from "react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useOverlayPortalContainer } from "@/components/ui/overlay-portal-context";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof Primitive.Content>) {
  const portalContainer = useOverlayPortalContainer();
  return (
    <Primitive.Portal container={portalContainer ?? undefined}>
      <Primitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("z-[150] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-48 overflow-y-auto rounded-xl border border-border bg-bg p-1.5 text-fg shadow-float outline-none", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

const itemClass = "relative flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none focus:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:min-h-9";

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item data-slot="dropdown-menu-item" className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem className={cn(itemClass, "pl-9", className)} {...props}>
      <span className="absolute left-3 flex size-4 items-center justify-center"><Primitive.ItemIndicator><IconCheck /></Primitive.ItemIndicator></span>
      {children}
    </Primitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(itemClass, "pl-9", className)} {...props}>
      <span className="absolute left-3 flex size-4 items-center justify-center"><Primitive.ItemIndicator><span className="size-1.5 rounded-full bg-fg" /></Primitive.ItemIndicator></span>
      {children}
    </Primitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-3 py-2 text-xs font-medium text-fg-muted", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
