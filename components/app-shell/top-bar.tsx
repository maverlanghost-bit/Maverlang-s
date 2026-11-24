"use client";

import Link from "next/link";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { openStockSearch } from "@/components/app-shell/stock-search";
import { Avatar } from "@/components/ui/avatar";
import { IconSearch } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountMode } from "@/lib/account/mode";
import { useT } from "@/lib/hooks/use-t";

import "./liquid-glass.css";

/**
 * Controles superiores flotantes en móvil (< lg), sin franja propia: avatar
 * hacia perfil y píldora ancha de búsqueda, ambos chips de vidrio sobre el
 * contenido. En escritorio (>= lg) todo vive en el sidebar.
 *
 * `hideMobileCluster` los oculta en /app/asistente, donde el chat ya tiene su
 * propia barra superior. La paleta (⌘K / Ctrl+K) sigue activa.
 */
export function TopBar({
  accountMode = "demo",
  hideMobileCluster = false,
}: {
  accountMode?: AccountMode;
  hideMobileCluster?: boolean;
}) {
  const { t, language } = useT();
  const account = useAccountLabel();
  const base = account.loading ? t.shell.account : `${account.name}. ${t.shell.account}`;
  const label = accountMode === "demo" ? `${base}. ${t.account.badge}` : base;
  const searchText = language === "en" ? "Search a stock" : "Buscar una acción";

  return (
    <>
      {hideMobileCluster ? null : (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex items-center gap-2 lg:hidden">
          <Link href="/app/perfil" aria-label={label} className="liquid-glass--chip touch-manipulation">
            {account.loading ? (
              <Skeleton className="size-8 rounded-full" />
            ) : (
              <Avatar alt="" fallback={account.name} size="md" className="size-8" />
            )}
            {accountMode === "demo" ? (
              <span aria-hidden className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-warn ring-2 ring-bg" />
            ) : null}
          </Link>
          <button
            type="button"
            data-stock-search-trigger=""
            aria-label={t.shell.search}
            aria-haspopup="dialog"
            onClick={openStockSearch}
            className="liquid-glass--chip liquid-glass--chip-wide touch-manipulation text-base text-fg-muted"
          >
            <IconSearch className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{searchText}</span>
          </button>
        </div>
      )}
      <CommandPalette />
    </>
  );
}
