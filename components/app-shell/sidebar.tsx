"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { BrandMark } from "@/components/app-shell/brand-mark";
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
  /** Marca colapsada: favicon de Maverlang (N17). Si aún no existe el PNG, letra M. */
  const [markFailed, setMarkFailed] = useState(false);
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
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 px-2 py-5">
          <Link
            href="/app"
            aria-label={site.name}
            title={site.name}
            className="flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full"
          >
            {markFailed ? (
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg" aria-hidden>
                M
              </span>
            ) : (
              <Image
                src="/brand/maverlang-mark.png"
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-full object-cover"
                onError={() => setMarkFailed(true)}
              />
            )}
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <BrandMark />
        </div>
      )}
      {collapsed ? (
        <nav aria-label={t.nav.label} className="flex-1 px-2">
          <ul className="flex flex-col items-center gap-1">
            {shellNav.map((item) => {
              const active = isShellSectionActive(pathname, item.id);
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Tooltip content={t.nav[item.id]}>
                    <Link
                      href={item.href}
                      aria-label={t.nav[item.id]}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex size-11 cursor-pointer items-center justify-center rounded-xl transition duration-200 ease-spring active:scale-[0.98]",
                        active ? "bg-surface-2 text-fg" : "text-fg-body hover:bg-surface-2",
                      )}
                    >
                      <Icon className="size-4" />
                    </Link>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : (
        <nav aria-label={t.nav.label} className="flex-1 px-3">
          <ul className="flex flex-col gap-1">
            {shellNav.map((item) => {
              const active = isShellSectionActive(pathname, item.id);
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm transition duration-200 ease-spring active:scale-[0.98]",
                      active ? "bg-surface-2 font-medium text-fg" : "text-fg-body hover:bg-surface-2",
                    )}
                  >
                    <Icon className="size-4" />
                    {t.nav[item.id]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 border-t border-border p-2">
          <Link
            href="/app/perfil"
            aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
            title={loading ? t.shell.account : name}
            className="flex size-10 cursor-pointer items-center justify-center rounded-xl hover:bg-surface-2"
          >
            {loading ? (
              <Skeleton className="size-10 rounded-full" />
            ) : (
              <Avatar alt="" fallback={name} size="md" />
            )}
          </Link>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <AccountSwitch mode={accountMode} onChange={onAccountChange ?? (() => {})} />
          <div className="mt-3">
            <BalanceHeader variant="sidebar" />
          </div>
          <div
            ref={menuRef}
            className="relative mt-3"
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuOpen(false);
            }}
          >
            {menuOpen && !loading ? (
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
              <div className="flex min-h-11 items-center gap-2 rounded-xl px-1">
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : (
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`${name}. ${t.shell.account}`}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-1 text-left hover:bg-surface-2"
              >
                <Avatar alt="" fallback={name} size="md" className="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{name}</span>
                  {account.email ? <span className="block truncate text-xs text-fg-muted">{account.email}</span> : null}
                </span>
                <IconChevron className={cn("size-4 shrink-0 text-fg-muted transition duration-200", menuOpen && "rotate-180")} />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
