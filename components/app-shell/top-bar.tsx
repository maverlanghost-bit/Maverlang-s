"use client";

import Link from "next/link";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

import "./liquid-glass.css";

/**
 * Controles superiores flotantes en móvil (< lg): avatar hacia perfil y lupa
 * de acciones en chips Liquid Glass sobre la esquina superior izquierda. En
 * escritorio (>= lg) la navegación, el buscador y la cuenta viven en el
 * sidebar; la moneda vive en el menú del perfil y en ajustes.
 *
 * `hideMobileCluster` oculta los chips en /app/asistente, donde el chat ya
 * tiene su propia barra superior. La paleta (⌘K / Ctrl+K) sigue activa.
 */
export function TopBar({
  accountMode = "demo",
  hideMobileCluster = false,
}: {
  accountMode?: AccountMode;
  hideMobileCluster?: boolean;
}) {
  const { t } = useT();
  const account = useAccountLabel();
  const base = account.loading ? t.shell.account : `${account.name}. ${t.shell.account}`;
  const label = accountMode === "demo" ? `${base}. ${t.account.badge}` : base;

  return (
    <>
      {hideMobileCluster ? null : (
        <div className="fixed top-[calc(env(safe-area-inset-top)+10px)] left-3 z-30 flex items-center gap-2 lg:hidden">
          <Link
            href="/app/perfil"
            aria-label={label}
            className="liquid-glass--chip touch-manipulation"
          >
            {account.loading ? (
              <Skeleton className="size-8 rounded-full" />
            ) : (
              <Avatar alt="" fallback={account.name} size="md" className="size-8" />
            )}
            {accountMode === "demo" ? (
              <span aria-hidden className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-warn ring-2 ring-bg" />
            ) : null}
          </Link>
          <StockSearchButton variant="chip" />
        </div>
      )}
      <CommandPalette />
    </>
  );
}
