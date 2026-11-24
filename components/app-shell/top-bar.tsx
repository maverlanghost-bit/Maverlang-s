"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { openStockSearch } from "@/components/app-shell/stock-search";
import { IconSearch } from "@/components/ui/icons";
import type { AccountMode } from "@/lib/account/mode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

const ICON_BUTTON =
  "relative flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

/** Ícono de menú: nueve puntos en grilla 3×3. */
function IconDots() {
  const points = [5, 12, 19];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-6">
      {points.flatMap((cy) => points.map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" />))}
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-6">
      <path
        d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 3.6 1.4 5.3 2 6H4.5c.6-.7 2-2.4 2-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Barra superior móvil (< lg), estilo app de brokerage: menú (cuenta) a la
 * izquierda, píldora de búsqueda al centro y alertas a la derecha. En
 * escritorio (>= lg) todo vive en el sidebar.
 *
 * `hideMobileCluster` la oculta en /app/asistente, donde el chat ya tiene su
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const base = account.loading ? t.shell.account : `${account.name}. ${t.shell.account}`;
  const menuLabel = accountMode === "demo" ? `${base}. ${t.account.badge}` : base;
  const searchText = language === "en" ? "Search a stock" : "Buscar una acción";
  const alertsLabel = language === "en" ? "Alerts" : "Alertas";

  return (
    <>
      {hideMobileCluster ? null : (
        <header
          className={cn(
            "fixed inset-x-0 top-0 z-30 border-b bg-bg pt-[env(safe-area-inset-top)] transition-colors lg:hidden",
            scrolled ? "border-border" : "border-transparent",
          )}
        >
          <div className="flex h-14 items-center gap-2 px-2">
            <Link href="/app/perfil" aria-label={menuLabel} className={ICON_BUTTON}>
              <IconDots />
              {accountMode === "demo" ? (
                <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-warn ring-2 ring-bg" />
              ) : null}
            </Link>
            <button
              type="button"
              data-stock-search-trigger=""
              aria-label={t.shell.search}
              aria-haspopup="dialog"
              onClick={openStockSearch}
              className="flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full bg-surface-2 px-4 text-left text-base text-fg-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
            >
              <IconSearch className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{searchText}</span>
            </button>
            <Link href="/app/alertas" aria-label={alertsLabel} className={ICON_BUTTON}>
              <IconBell />
            </Link>
          </div>
        </header>
      )}
      <CommandPalette />
    </>
  );
}
