"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

export function BottomTabs() {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {shellNav.map((item) => {
          const active = isShellSectionActive(pathname, item.id);
          const Icon = item.icon;
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors duration-[140ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                  active ? "font-medium text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                <span
                  className={cn("absolute inset-x-3 top-0 h-0.5 rounded-full", active ? "bg-fg" : "bg-transparent")}
                  aria-hidden
                />
                <Icon className="size-5" />
                <span className="max-w-full truncate">{t.nav[item.id]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
