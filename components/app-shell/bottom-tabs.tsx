"use client";

import { useEffect, useRef, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Publica el alto real (píldora + margen + safe-area) para la barra de compra y los toasts. */
function useTabsHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const nav = ref.current;
      if (query.matches || !nav) return root.style.setProperty("--app-tabs-height", "0px");
      const rect = nav.getBoundingClientRect();
      root.style.setProperty("--app-tabs-height", `${window.innerHeight - rect.top}px`);
    };
    apply();
    const nav = ref.current;
    const observer = new ResizeObserver(apply);
    if (nav) observer.observe(nav);
    query.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="glass-tabbar pointer-events-auto grid h-16 w-full max-w-md grid-cols-4 rounded-full p-1.5">
        {shellNav.map((item) => {
          const active = isShellSectionActive(pathname, item.id);
          const Icon = item.icon;
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-medium tracking-tight outline-none transition duration-150 ease-spring focus-visible:ring-2 focus-visible:ring-fg active:scale-[0.96]",
                  active ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{t.nav[item.id]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
