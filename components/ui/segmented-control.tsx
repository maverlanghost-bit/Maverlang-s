"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { indexFromKey } from "@/components/ui/keys";

export type SegmentOption = { value: string; label: string; disabled?: boolean };

export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  fullWidth = false,
  toggle = false,
}: {
  label: string;
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  fullWidth?: boolean;
  /** Botones con aria-pressed. Sin esto sigue siendo un grupo de radio. */
  toggle?: boolean;
}) {
  const baseId = useId();
  const enabled = options.filter((option) => !option.disabled);

  function move(current: string, key: string) {
    const index = Math.max(0, enabled.findIndex((option) => option.value === current));
    const next = indexFromKey(key, index, enabled.length);
    if (next === null) return;
    const option = enabled[next];
    if (!option) return;
    onChange(option.value);
    document.getElementById(`${baseId}-${option.value}`)?.focus();
  }

  return (
    <div
      role={toggle ? "group" : "radiogroup"}
      aria-label={label}
      className={cn("inline-flex max-w-full rounded-full bg-surface-2 p-1", fullWidth && "flex w-full")}
      onKeyDown={(event) => {
        if (indexFromKey(event.key, 0, enabled.length) === null) return;
        event.preventDefault();
        move(value, event.key);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`${baseId}-${option.value}`}
            type="button"
            role={toggle ? undefined : "radio"}
            aria-pressed={toggle ? selected : undefined}
            aria-checked={toggle ? undefined : selected}
            disabled={option.disabled}
            tabIndex={toggle || selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-full px-3 text-sm transition duration-[140ms] ease-spring outline-none active:scale-[0.98] focus-visible:relative focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-fg/20",
              fullWidth && "min-w-0 flex-1 px-1 sm:px-3",
              selected ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
