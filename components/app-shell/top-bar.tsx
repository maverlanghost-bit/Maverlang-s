"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
  const clusterRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  // Se oculta al bajar y reaparece al subir (el scroll es del documento, no de un contenedor).
  useEffect(() => {
    if (hideMobileCluster) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const el = clusterRef.current;
      const busy =
        (el?.querySelector(":focus-visible") ?? null) !== null || document.querySelector('[role="dialog"]') !== null;
      if (y < 56 || busy) {
        setHidden(false);
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < 8) return;
      setHidden(delta > 0);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [hideMobileCluster]);

  return (
    <>
      {hideMobileCluster ? null : (
        <div
          ref={clusterRef}
          data-hidden={hidden}
          className="top-cluster fixed inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex items-center gap-2 lg:hidden"
        >
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
            className="liquid-glass--chip liquid-glass--chip-wide touch-manipulation text-base"
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
