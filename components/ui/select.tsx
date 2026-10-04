"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { IconCheck, IconChevron } from "@/components/ui/icons";
import { indexFromKey } from "@/components/ui/keys";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function Select({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Elige una opción",
  disabled = false,
  name,
  id,
}: {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
}) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const labelId = `${buttonId}-label`;
  const listId = `${buttonId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const selected = value ?? internal;
  const selectedOption = options.find((option) => option.value === selected);
  const initialActive = Math.max(0, options.findIndex((option) => option.value === selected));
  const [active, setActive] = useState(initialActive);
  const enabled = options.map((option, index) => ({ option, index })).filter((item) => !item.option.disabled);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function commit(next: string) {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setActive(Math.max(0, options.findIndex((option) => option.value === selected)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option && !option.disabled) commit(option.value);
      return;
    }
    const current = enabled.findIndex((item) => item.index === active);
    const next = indexFromKey(event.key, Math.max(current, 0), enabled.length);
    if (next === null) return;
    event.preventDefault();
    const item = enabled[next];
    if (item) setActive(item.index);
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <label id={labelId} htmlFor={buttonId} className="text-sm font-medium text-fg">
        {label}
      </label>
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <div className="relative">
        <button
          id={buttonId}
          type="button"
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="none"
          aria-activedescendant={open ? `${listId}-opt-${active}` : undefined}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            setActive(Math.max(0, options.findIndex((option) => option.value === selected)));
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 text-left text-base text-fg transition duration-[140ms] focus:border-border-strong disabled:opacity-40"
        >
          <span className={cn("truncate", !selectedOption && "text-fg-subtle")}>
            {selectedOption?.label ?? placeholder}
          </span>
          <IconChevron className={cn("shrink-0 text-fg-muted transition duration-[140ms]", open && "rotate-180")} />
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className="absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-bg p-1 shadow-float"
          >
            {options.map((option, index) => {
              const isSelected = option.value === selected;
              const isActive = index === active;
              return (
                <li
                  key={option.value}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onMouseEnter={() => {
                    if (!option.disabled) setActive(index);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!option.disabled) commit(option.value);
                  }}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-sm",
                    isActive && "bg-surface-2",
                    isSelected && "font-medium text-fg",
                    option.disabled && "cursor-not-allowed text-fg-subtle",
                  )}
                >
                  {option.label}
                  {isSelected ? <IconCheck className="text-fg" /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
