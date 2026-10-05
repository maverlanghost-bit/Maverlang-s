"use client";

import { useEffect, useRef, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Publica el alto real de las tabs (iconos + borde + safe-area) para la barra de compra. */
function useTabsHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const nav = ref.current;
      if (query.matches || !nav) {
        root.style.setProperty("--app-tabs-height", "0px");
        return;
      }
      root.style.setProperty("--app-tabs-height", `${nav.getBoundingClientRect().height}px`);
    };
    apply();
    const nav = ref.current;
    const observer = new ResizeObserver(apply);
    if (nav) observer.observe(nav);
    query.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", apply);
      root.style.removeProperty("--app-tabs-height");
    };
  }, [ref]);
}

export function BottomTabs() {
  const pathname = usePathname();
  const { t } = useT();
  const navRef = useRef<HTMLElement>(null);
  useTabsHeight(navRef);

  return (
    <nav
      ref={navRef}
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
                  "relative flex h-full flex-col items-center justify-center gap-1 px-1 text-xs transition duration-[140ms] ease-spring active:scale-[0.98]",
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
