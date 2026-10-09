"use client";

import Link from "next/link";
import { useAccountLabel } from "@/components/app-shell/account-label";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

/**
 * Barra superior móvil, limpia y con una sola intención por zona:
 *  - Izquierda: perfil (avatar) → /app/perfil.
 *  - Centro: marca + insignia Demo.
 *  - Derecha: buscar.
 * El saldo vive en la cartera y el mercado (no apiña la barra) y la moneda
 * se elige en Ajustes (ya no hay atajo USD/CLP acá, que saturaba el top).
 */
export function TopBar({ accountMode = "demo" }: { accountMode?: AccountMode }) {
  const { t } = useT();
  const account = useAccountLabel();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-4 backdrop-blur-md pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex min-h-14 items-center gap-3 py-2">
        <Link
          href="/app/perfil"
          aria-label={account.loading ? t.shell.account : `${account.name}. ${t.shell.account}`}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition duration-140 ease-spring hover:bg-surface-2 active:scale-[0.98]"
        >
          {account.loading ? (
            <Skeleton className="size-8 rounded-full" />
          ) : (
            <Avatar alt="" fallback={account.name} size="md" className="size-8" />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <BrandMark />
          {accountMode === "demo" ? <Badge tone="warn">{t.account.badge}</Badge> : null}
        </div>
        <StockSearchButton variant="icon" />
      </div>
    </header>
  );
}
