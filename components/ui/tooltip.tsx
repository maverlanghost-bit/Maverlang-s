"use client";

import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type TooltipChild = {
  className?: string;
  "aria-describedby"?: string;
};

export function Tooltip({
  content,
  children,
  defaultOpen = false,
  side = "bottom",
}: {
  content: ReactNode;
  children: ReactElement<TooltipChild>;
  defaultOpen?: boolean;
  side?: "bottom" | "right" | "top";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  if (!isValidElement<TooltipChild>(children)) return children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "absolute",
            side === "right"
              ? "top-1/2 left-full z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl border border-white/15 bg-fg px-3 py-1.5 text-xs font-medium leading-none text-white shadow-[0_10px_28px_-6px_rgba(12,15,20,0.35)] pointer-events-none"
              : side === "top"
                ? "bottom-full left-0 z-30 mb-2 w-max max-w-[min(16rem,calc(100vw-2.5rem))] rounded-md bg-fg px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-float pointer-events-none"
                : "top-full left-0 z-30 mt-2 w-max max-w-[min(16rem,calc(100vw-2.5rem))] rounded-md bg-fg px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-float",
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
