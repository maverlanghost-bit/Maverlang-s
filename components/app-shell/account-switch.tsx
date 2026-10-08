"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
      <SegmentedControl
        label={t.account.typeLabel}
        toggle
        fullWidth
        compact
        value={mode === "real" ? "demo" : mode}
        options={[
          { value: "demo", label: t.account.demo },
          { value: "real", label: t.account.real },
        ]}
        onChange={(value) => pick(value === "real" ? "real" : "demo")}
      />
      {notice}
    </div>
  );
}
