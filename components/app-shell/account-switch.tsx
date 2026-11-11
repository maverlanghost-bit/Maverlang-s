"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { indexFromKey } from "@/components/ui/keys";
import { Tooltip } from "@/components/ui/tooltip";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";
import { cn } from "@/lib/cn";

/**
 * Interruptor "Cuenta demo / Cuenta real". La demo es la única que opera.
 * Pulsar la real abre un aviso y no cambia de cuenta. En el riel colapsado
 * queda como insignia.
 */
export function AccountSwitch({
  mode,
  onChange,
  collapsed = false,
}: {
  mode: AccountMode;
  onChange: (mode: AccountMode) => void;
  collapsed?: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [soonOpen, setSoonOpen] = useState(false);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  /** La cuenta real todavía no opera: la demo queda marcada. */
  const current: AccountMode = mode === "real" ? "demo" : mode;
  const options = [
    { value: "demo" as const, label: t.account.demo },
    { value: "real" as const, label: t.account.real },
  ];

  function pick(next: AccountMode) {
    if (next === "real") {
      setSoonOpen(true);
      return;
    }
    if (mode !== "demo") onChange("demo");
  }

  function explore() {
    setSoonOpen(false);
    router.push("/app");
  }

  const notice = (
    <Dialog open={soonOpen} onOpenChange={setSoonOpen} title={t.account.soonTitle} description={t.account.soonBody}>
      <div className="mt-6 flex sm:justify-end">
        <Button size="lg" className="w-full sm:w-auto" onClick={explore}>
          {t.account.soonAction}
        </Button>
      </div>
    </Dialog>
  );

  if (collapsed) {
    const next: AccountMode = mode === "demo" ? "real" : "demo";
    const label = mode === "demo" ? t.account.switchToReal : t.account.switchToDemo;
    return (
      <>
        <Tooltip content={`${t.account.typeLabel}: ${t.account[mode]}. ${label}`}>
          <button
            type="button"
            onClick={() => pick(next)}
            aria-label={`${t.account.typeLabel}: ${t.account[mode]}. ${label}`}
            className="flex size-11 cursor-pointer items-center justify-center rounded-xl transition duration-200 ease-spring hover:bg-surface-2 active:scale-[0.98]"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                mode === "demo" ? "bg-warn-bg text-warn" : "bg-surface-3 text-fg-body",
              )}
            >
              {mode === "demo" ? "D" : "R"}
            </span>
          </button>
        </Tooltip>
        {notice}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t.account.typeLabel}
        onKeyDown={(event) => {
          const index = options.findIndex((option) => option.value === current);
          const next = indexFromKey(event.key, index, options.length);
          if (next === null) return;
          const option = options[next];
          if (!option) return;
          event.preventDefault();
          pick(option.value);
          buttons.current[option.value]?.focus();
        }}
        className="grid w-full grid-cols-2 rounded-full border border-border-control bg-surface-1 p-0.5"
      >
        {options.map((option) => {
          const active = option.value === current;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[option.value] = node;
              }}
              type="button"
              aria-pressed={active}
              tabIndex={active ? 0 : -1}
              onClick={() => pick(option.value)}
              className={cn(
                "min-h-11 min-w-0 cursor-pointer rounded-full px-1.5 text-[12px] leading-tight transition-colors duration-150",
                active
                  ? "bg-bg font-medium text-fg shadow-raised ring-1 ring-border"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              <span className="block truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {notice}
    </div>
  );
}
