"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { indexFromKey } from "@/components/ui/keys";

export type TabItem = {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
};

export function Tabs({
  tabs,
  value,
  defaultValue,
  onValueChange,
  label = "Pestañas",
}: {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label?: string;
}) {
  const baseId = useId();
  const first = tabs.find((tab) => !tab.disabled)?.value ?? tabs[0]?.value ?? "";
  const [internal, setInternal] = useState(defaultValue ?? first);
  const selected = value ?? internal;
  const current = tabs.find((tab) => tab.value === selected) ?? tabs[0];
  const enabled = tabs.filter((tab) => !tab.disabled);

  function select(next: string) {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label={label}
        /* Móvil: la tira se desplaza dentro de su caja (sin scrollbar visible y
           sin desbordar la página); el borde inferior sigue marcando el eje. */
        className="no-scrollbar flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b border-border"
        onKeyDown={(event) => {
          if (indexFromKey(event.key, 0, enabled.length) === null) return;
          event.preventDefault();
          const index = Math.max(0, enabled.findIndex((tab) => tab.value === selected));
          const nextIndex = indexFromKey(event.key, index, enabled.length);
          if (nextIndex === null) return;
          const next = enabled[nextIndex];
          if (next) select(next.value);
        }}
      >
        {tabs.map((tab) => {
          const active = tab.value === selected;
          return (
            <button
              key={tab.value}
              id={`${baseId}-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-panel-${tab.value}`}
              tabIndex={active ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.value)}
              className={cn(
                /* 44 px de alto táctil; el activo se marca con barra de 2 px y
                   fondo al presionar (escalar el botón cortaba la barra). */
                "min-h-11 shrink-0 border-b-2 px-3 text-sm whitespace-nowrap transition duration-[140ms] ease-spring active:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-inset focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                active ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${current.value}`}
          aria-labelledby={`${baseId}-tab-${current.value}`}
          key={current.value}
          className="animate-tab pt-4 text-sm leading-relaxed text-fg-body outline-none"
        >
          {current.content}
        </div>
      ) : null}
    </div>
  );
}
