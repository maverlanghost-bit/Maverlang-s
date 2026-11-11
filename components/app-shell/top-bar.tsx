"use client";

import Link from "next/link";
import { useAccountLabel } from "@/components/app-shell/account-label";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

/**
 * Cluster flotante móvil (Liquid Glass) fijo arriba a la izquierda, sobre el
 * contenido: avatar de perfil + buscador. Sin barra ancha ni título de sección.
 * El badge Demo es un punto de aviso sobre el avatar (el texto va en aria-label).
 * La moneda se cambia desde /app/perfil. En lg+ manda la sidebar.
 *
 * `hideMobileCluster` oculta el clúster (solo móvil) en rutas donde el chat de
 * IA ya trae su propia navegación superior; no afecta la paleta de comandos.
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
        <div className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+10px)] left-3 z-30 flex items-center gap-2 lg:hidden">
          <Link href="/app/perfil" aria-label={label} className="liquid-glass--chip pointer-events-auto">
            {account.loading ? (
              <Skeleton className="size-8 rounded-full" />
            ) : (
              <Avatar alt="" fallback={account.name} size="md" className="size-8 ring-1 ring-border/80" />
            )}
            {accountMode === "demo" ? (
              <span aria-hidden className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-warn ring-2 ring-surface" />
            ) : null}
          </Link>
          <div className="pointer-events-auto">
            <StockSearchButton variant="chip" />
          </div>
        </div>
      )}
      <CommandPalette />
    </>
  );
}
