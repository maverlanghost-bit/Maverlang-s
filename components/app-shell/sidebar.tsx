"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandMarkImage } from "@/components/app-shell/brand-image";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Avatar } from "@/components/ui/avatar";
import { IconChevron } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { AccountSwitch } from "@/components/app-shell/account-switch";
import { site } from "@/config/site";
import { shouldIgnoreSidebarShortcut, shouldToggleSidebarClick } from "@/lib/app-shell/sidebar";
import type { AccountMode } from "@/lib/account/mode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

const WIDTH_ANIMATION = "transition-[width] duration-200 ease-spring";

export function Sidebar({
  collapsed,
  onToggle,
  accountMode = "demo",
  onAccountChange,
}: {
  collapsed: boolean;
  onToggle: () => void;
  accountMode?: AccountMode;
  onAccountChange?: (mode: AccountMode) => void;
}) {
  const pathname = usePathname();
  const { t } = useT();
  const account = useAccountLabel();
  const name = account.name;
  const loading = account.loading;
  /** Menú del perfil: Perfil, Ajustes, moneda y salir. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /** Clic afuera cierra el menú del perfil. */
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node | null)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "b") return;
      if (shouldIgnoreSidebarShortcut(document.activeElement)) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);

  return (
    <aside
      onClick={(event) => {
        if (shouldToggleSidebarClick(event.target as Element | null)) onToggle();
      }}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-border bg-bg lg:flex",
        WIDTH_ANIMATION,
        collapsed ? "w-[72px] cursor-e-resize" : "w-[240px] cursor-w-resize",
      )}
    >
      {/* Marca: siempre el favicon; al expandir aparece el nombre a la derecha. */}
      <div className="flex items-center gap-0 px-2 py-5">
        <Link
          href="/app"
          aria-label={site.name}
          title={site.name}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl"
        >
          <span className="flex size-11 shrink-0 items-center justify-center">
            <BrandMarkImage />
          </span>
          <span
            aria-hidden
            className={cn(
              "overflow-hidden text-sm font-medium whitespace-nowrap text-fg transition-all duration-200 ease-spring",
              collapsed ? "max-w-0 opacity-0" : "max-w-44 opacity-100",
            )}
          >
            {site.name}
          </span>
        </Link>
      </div>
      <nav aria-label={t.nav.label} className="flex-1 px-2">
        <ul className="flex flex-col gap-1">
          {shellNav.map((item) => {
            const active = isShellSectionActive(pathname, item.id);
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                aria-label={collapsed ? t.nav[item.id] : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl text-sm transition duration-200 ease-spring active:scale-[0.98]",
                  active ? "bg-surface-2 font-medium text-fg" : "text-fg-body hover:bg-surface-2",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center">
                  <Icon className="size-4" />
                </span>
                <span
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-all duration-200 ease-spring",
                    collapsed ? "max-w-0 opacity-0" : "max-w-44 opacity-100",
                  )}
                >
                  {t.nav[item.id]}
                </span>
              </Link>
            );
            return (
              <li key={item.id}>
                {collapsed ? <Tooltip content={t.nav[item.id]}>{link}</Tooltip> : link}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border px-2 py-2">
        {!collapsed ? (
          <>
            <AccountSwitch mode={accountMode} onChange={onAccountChange ?? (() => {})} />
            <div className="mt-3">
              <BalanceHeader variant="sidebar" />
            </div>
          </>
        ) : null}
        <div
          ref={menuRef}
          className={cn("relative", !collapsed && "mt-3")}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
        >
          {menuOpen && !collapsed && !loading ? (
            <div
              role="menu"
              aria-label={t.shell.account}
              className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-1 rounded-xl border border-border bg-bg p-2 shadow-lg"
            >
              <Link
                role="menuitem"
                href="/app/perfil"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-fg-body hover:bg-surface-2"
              >
                {t.nav.profile}
              </Link>
              <Link
                role="menuitem"
                href="/app/ajustes"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-fg-body hover:bg-surface-2"
              >
                {t.nav.settings}
              </Link>
              <div className="flex justify-start px-3 py-2">
                <CurrencySwitch />
              </div>
              <button
                role="menuitem"
                type="button"
                onClick={() => void account.logout()}
                disabled={account.status === "loading"}
                className="flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-sm text-fg-body hover:bg-surface-2 disabled:opacity-40"
              >
                {t.profile.logout}
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="flex min-h-11 items-center rounded-xl">
              <span className="flex size-11 shrink-0 items-center justify-center">
                <Skeleton className="size-10 rounded-full" />
              </span>
              {!collapsed ? <Skeleton className="h-4 w-24" /> : null}
            </div>
          ) : collapsed ? (
            <Link
              href="/app/perfil"
              aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
              title={loading ? t.shell.account : name}
              className="flex min-h-11 cursor-pointer items-center rounded-xl hover:bg-surface-2"
            >
              <span className="flex size-11 shrink-0 items-center justify-center">
                <Avatar alt="" fallback={name} size="md" className="size-10" />
              </span>
            </Link>
          ) : (
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${name}. ${t.shell.account}`}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex min-h-11 w-full cursor-pointer items-center rounded-xl text-left hover:bg-surface-2"
            >
              <span className="flex size-11 shrink-0 items-center justify-center">
                <Avatar alt="" fallback={name} size="md" className="size-10" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{name}</span>
                {account.email ? <span className="block truncate text-xs text-fg-muted">{account.email}</span> : null}
              </span>
              <IconChevron className={cn("size-4 shrink-0 text-fg-muted transition duration-200", menuOpen && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
