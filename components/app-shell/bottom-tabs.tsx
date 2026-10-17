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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-bg/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid h-16 grid-cols-3">
        {shellNav.map((item) => {
          const active = isShellSectionActive(pathname, item.id);
          const Icon = item.icon;
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium tracking-tight outline-none transition duration-150 ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0 h-0.5 rounded-full transition duration-150 ease-spring",
                    active ? "left-1/2 w-6 -translate-x-1/2 bg-fg" : "inset-x-4 bg-transparent",
                  )}
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
