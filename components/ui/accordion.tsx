"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconChevron } from "@/components/ui/icons";

export type AccordionItem = { id: string; title: string; content: ReactNode };

export function Accordion({
  items,
  type = "single",
  defaultValue = [],
}: {
  items: AccordionItem[];
  type?: "single" | "multiple";
  defaultValue?: string[];
}) {
  const baseId = useId();
  const [openIds, setOpenIds] = useState(defaultValue);

  function toggle(id: string) {
    setOpenIds((current) => {
      const open = current.includes(id);
      if (type === "multiple") return open ? current.filter((item) => item !== id) : [...current, id];
      return open ? [] : [id];
    });
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((item) => {
        const open = openIds.includes(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-fg"
              >
                {item.title}
                <IconChevron className={cn("shrink-0 text-fg-muted transition duration-[140ms]", open && "rotate-180")} />
              </button>
            </h3>
            {open ? (
              <div id={panelId} role="region" aria-labelledby={buttonId} className="px-4 pb-4 text-sm leading-relaxed text-fg-body">
                {item.content}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
