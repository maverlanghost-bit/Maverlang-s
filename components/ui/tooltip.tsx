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
            "pointer-events-none absolute z-50 w-max max-w-[min(16rem,calc(100vw-2.5rem))] rounded-lg border border-border bg-bg px-2.5 py-1.5 text-left text-[13px] leading-snug text-pretty text-fg shadow-float",
            side === "right"
              ? "top-1/2 left-full ml-3 -translate-y-1/2"
              : side === "top"
                ? "bottom-full left-0 mb-2"
                : "top-full left-0 mt-2",
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
