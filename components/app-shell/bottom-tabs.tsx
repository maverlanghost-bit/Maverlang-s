"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import "./liquid-glass.css";

import {
  activeMobileTab,
  mobileTabs,
  nextTabBarHidden,
  shellTabLabel,
} from "@/components/app-shell/nav";
import { IconStar } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Publica el alto en reposo (sin el translate del scroll) para la barra de compra y los toasts. */
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
      root.style.setProperty("--app-tabs-height", `${nav.offsetHeight}px`);
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

/** Se esconde al bajar y vuelve al subir. El foco dentro de la barra la deja fija. */
function useTabBarHidden(pathname: string, pinned: boolean): boolean {
  const [state, setState] = useState({ path: pathname, hidden: false });
  const previous = useRef(0);
  const generation = useRef(0);

  if (state.path !== pathname) {
    setState({ path: pathname, hidden: false });
  }

  useEffect(() => {
    generation.current += 1;
    previous.current = window.scrollY || 0;
  }, [pathname]);

  useEffect(() => {
    previous.current = window.scrollY || 0;
    let frame = 0;
    let frameGeneration = 0;
    const onScroll = () => {
      if (frame) return;
      frameGeneration = generation.current;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (frameGeneration !== generation.current) return;
        const nextY = window.scrollY || document.documentElement.scrollTop || 0;
        const from = previous.current;
        previous.current = nextY;
        setState((current) => {
          const next = nextTabBarHidden(current.hidden, from, nextY);
          if (next === current.hidden) return current;
          return { path: current.path, hidden: next };
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const hidden = state.path === pathname ? state.hidden : false;
  return pinned ? false : hidden;
}

export function BottomTabs() {
  const pathname = usePathname();
  const { t, language } = useT();
  const navRef = useRef<HTMLElement>(null);
  const [pinned, setPinned] = useState(false);
  const hidden = useTabBarHidden(pathname, pinned);
  const activeIndex = activeMobileTab(pathname);
  useTabsHeight(navRef);

  return (
    <nav
      ref={navRef}
      role="navigation"
      aria-label={t.nav.label}
      data-hidden={hidden ? "true" : "false"}
      onFocus={() => setPinned(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setPinned(false);
      }}
      className="liquid-nav pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="liquid-glass backdrop-blur-xl border border-border/70">
        <span
          className="liquid-glass__pill"
          data-hidden={activeIndex < 0 ? "true" : undefined}
          style={{ "--tab-index": activeIndex < 0 ? 0 : activeIndex } as CSSProperties}
          aria-hidden="true"
        />
        <ul className="liquid-glass__tabs">
          {mobileTabs.map((item) => {
            const active = activeIndex >= 0 && mobileTabs[activeIndex]?.id === item.id;
            const Icon = item.icon;
            const label = shellTabLabel(language, item.id, t.nav);
            const center = item.id === "assistant";
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-state={active ? "active" : "inactive"}
                  className={cn("liquid-tab", center && "liquid-tab--center")}
                >
                  {center ? (
                    <span className="liquid-tab__mark" aria-hidden="true">
                      <Icon className="liquid-tab__icon" />
                    </span>
                  ) : item.id === "favorites" ? (
                    <IconStar filled={active} className="liquid-tab__icon" />
                  ) : (
                    <Icon className="liquid-tab__icon" />
                  )}
                  <span className="liquid-tab__label">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
