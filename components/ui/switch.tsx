"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { IconCheck } from "@/components/ui/icons";

export function Switch({
  label,
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  id,
}: {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const [internal, setInternal] = useState(defaultChecked);
  const on = checked ?? internal;

  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3", disabled && "opacity-60")}>
      <label
        htmlFor={buttonId}
        className={cn("min-w-0 text-pretty text-sm text-fg", disabled && "cursor-not-allowed")}
      >
        {label}
      </label>
      {/* Foco: el outline global de 2 px (`:focus-visible`), el mismo de
          botones y enlaces; sin anillo propio que se sume o lo tape. */}
      <button
        id={buttonId}
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => {
          const next = !on;
          if (checked === undefined) setInternal(next);
          onCheckedChange?.(next);
        }}
        className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
      >
        {/* El estado no depende del color: la bolita cambia de lado y aparece la marca. */}
        <span className={cn("relative h-6 w-11 rounded-full transition duration-[140ms]", on ? "bg-fg" : "bg-control")}>
          <span
            aria-hidden
            className={cn(
              "absolute top-0.5 left-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow-raised transition duration-[140ms]",
              on && "translate-x-5",
            )}
          >
            <IconCheck className={cn("size-3 text-fg transition-opacity duration-[140ms]", on ? "opacity-100" : "opacity-0")} />
          </span>
        </span>
      </button>
    </div>
  );
}
