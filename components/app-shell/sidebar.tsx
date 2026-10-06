"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();
  const account = useAccountLabel();
  const name = account.name;
  const loading = account.loading;

  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col overflow-y-auto border-r border-border bg-bg lg:flex">
      <div className="px-4 py-5">
        <BrandMark />
      </div>
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
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition duration-[140ms] ease-spring active:scale-[0.98]",
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
      <div className="border-t border-border p-3">
        <BalanceHeader variant="sidebar" />
        <Link
          href="/app/perfil"
          aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
          className="mt-2 flex min-h-11 items-center gap-2 rounded-xl px-1 hover:bg-surface-2"
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
          className="mt-1 flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-fg-body hover:bg-surface-2 disabled:opacity-40"
        >
          {t.profile.logout}
        </button>
      </div>
    </aside>
  );
}
