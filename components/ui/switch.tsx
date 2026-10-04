"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

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
    <div className={cn("flex min-h-11 items-center justify-between gap-3", disabled && "opacity-40")}>
      <label htmlFor={buttonId} className="text-sm text-fg">
        {label}
      </label>
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
        className="inline-flex h-11 w-14 shrink-0 items-center justify-center disabled:pointer-events-none"
      >
        <span className={cn("relative h-6 w-11 rounded-full transition duration-[140ms]", on ? "bg-fg" : "bg-surface-3")}>
          <span
            aria-hidden
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full border border-border bg-bg transition duration-[140ms]",
              on && "translate-x-5",
            )}
          />
        </span>
      </button>
    </div>
  );
}
