"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { IconLogout, IconPanel } from "@/components/ui/icons";
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
  const toggleLabel = collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar;

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
            className="flex size-10 cursor-pointer items-center justify-center rounded-full"
          >
            <span className="size-2 rounded-full bg-brand" aria-hidden />
          </Link>
          <IconButton
            label={toggleLabel}
            aria-expanded={false}
            size="sm"
            onClick={onToggle}
            className="cursor-pointer"
          >
            <IconPanel />
          </IconButton>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <BrandMark />
          <IconButton
            label={toggleLabel}
            aria-expanded={true}
            size="sm"
            onClick={onToggle}
            className="cursor-pointer"
          >
            <IconPanel />
          </IconButton>
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
          <AccountSwitch mode={accountMode} onChange={onAccountChange ?? (() => {})} collapsed />
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
          <IconButton
            label={t.profile.logout}
            title={t.profile.logout}
            size="sm"
            disabled={account.status === "loading"}
            onClick={() => void account.logout()}
            className="cursor-pointer"
          >
            <IconLogout />
          </IconButton>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <AccountSwitch mode={accountMode} onChange={onAccountChange ?? (() => {})} />
          <div className="mt-3">
            <BalanceHeader variant="sidebar" />
          </div>
          <Link
            href="/app/perfil"
            aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
            className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-1 hover:bg-surface-2"
          >
            {loading ? (
              <>
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <Avatar alt="" fallback={name} size="md" className="size-11" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{name}</span>
                  {account.email ? <span className="block truncate text-xs text-fg-muted">{account.email}</span> : null}
                </span>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={() => void account.logout()}
            disabled={account.status === "loading"}
            className="mt-1 flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-sm text-fg-body hover:bg-surface-2 disabled:opacity-40"
          >
            {t.profile.logout}
          </button>
        </div>
      )}
    </aside>
  );
}
