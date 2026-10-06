"use client";

import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip } from "@/components/ui/tooltip";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";
import { cn } from "@/lib/cn";

/**
 * Interruptor "Cuenta demo / Cuenta real". En el riel colapsado queda
 * como insignia con tooltip que alterna al pulsar.
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

  if (collapsed) {
    const next: AccountMode = mode === "demo" ? "real" : "demo";
    const label = mode === "demo" ? t.account.switchToReal : t.account.switchToDemo;
    return (
      <Tooltip content={`${t.account.typeLabel}: ${t.account[mode]}. ${label}`}>
        <button
          type="button"
          onClick={() => onChange(next)}
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
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label={t.account.typeLabel}
        toggle
        fullWidth
        value={mode}
        options={[
          { value: "demo", label: t.account.demo },
          { value: "real", label: t.account.real },
        ]}
        onChange={(value) => onChange(value === "real" ? "real" : "demo")}
      />
      {mode === "demo" ? (
        <p className="flex items-center gap-2 text-xs leading-relaxed text-fg-muted">
          <Badge tone="warn">{t.account.badge}</Badge>
          <span>{t.account.note}</span>
        </p>
      ) : null}
    </div>
  );
}
