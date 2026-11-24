"use client";

import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useT } from "@/lib/hooks/use-t";

/**
 * Ojo para ocultar o mostrar los montos. Usa la misma preferencia por usuario
 * que el saldo del Mercado (`useHideBalance`). Sin sesión no se muestra.
 */
export function HideBalanceToggle({ className }: { className?: string }) {
  const { t } = useT();
  const { hidden, toggle, userId } = useHideBalance();
  if (!userId) return null;
  const masked = hidden === true;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={hidden === null}
      aria-pressed={masked}
      aria-label={masked ? t.shell.showBalance : t.shell.hideBalance}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-40",
        className,
      )}
    >
      {masked ? <IconEyeOff className="size-5" /> : <IconEye className="size-5" />}
    </button>
  );
}
