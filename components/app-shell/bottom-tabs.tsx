"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import "./liquid-glass.css";

import {
  AI_DOCK_SLOT_ID,
  activeMobileTab,
  mobileTabs,
  shellTabLabel,
} from "@/components/app-shell/nav";
import { IconBack, IconStar } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/**
 * Publica el alto de la barra (o del dock de IA) para la barra de compra, los toasts
 * y el padding del contenido. El ResizeObserver lo actualiza cuadro a cuadro durante el morph.
 * En /app/asistente la barra está oculta, así que el alto se fuerza a 0px sin medir.
 */
function useTabsHeight(ref: RefObject<HTMLElement | null>, assistantRoute: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const nav = ref.current;
      if (assistantRoute || query.matches || !nav) {
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
  }, [ref, assistantRoute]);
}

/**
 * Barra inferior fija: sin transform por scroll, sin ocultarse nunca.
 * En /app/asistente el mismo vidrio se transforma (morph) en el dock del chat.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const { t, language } = useT();
  const navRef = useRef<HTMLElement>(null);
  const assistantRoute =
    pathname === "/app/asistente" || pathname.startsWith("/app/asistente/");
  const mode = assistantRoute ? "composer" : "nav";
  const activeIndex = activeMobileTab(pathname);
  useTabsHeight(navRef, assistantRoute);

  return (
    <nav
      ref={navRef}
      role="navigation"
      aria-label={t.nav.label}
      data-hidden="false" /* Barra fija sin oscilaciones de nextTabBarHidden */
      data-mode={mode}
      data-assistant={assistantRoute ? "true" : "false"}
      className={cn(
        "liquid-nav pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] min-[400px]:px-4 md:hidden",
        assistantRoute && "hidden",
      )}
    >
      <div
        className="liquid-glass backdrop-blur-xl border border-border/70"
        data-mode={mode}
        data-assistant={assistantRoute ? "true" : "false"}
      >
        <span
          className="liquid-glass__pill"
          data-hidden={activeIndex < 0 || assistantRoute ? "true" : undefined}
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
                  aria-label={center ? label : undefined}
                  data-state={active ? "active" : "inactive"}
                  tabIndex={assistantRoute ? -1 : undefined}
                  className={cn("liquid-tab", center && "liquid-tab--center")}
                >
                  {center ? (
                    <>
                      <span className="liquid-tab__ai" aria-hidden="true">
                        AI
                      </span>
                      <span className="sr-only">{label}</span>
                    </>
                  ) : (
                    <>
                      {item.id === "favorites" ? (
                        <IconStar filled={active} className="liquid-tab__icon" />
                      ) : (
                        <Icon className="liquid-tab__icon" />
                      )}
                      <span className="liquid-tab__label">{label}</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="liquid-glass__dockwrap">
          <Link
            href="/app"
            aria-label={language === "en" ? "Back to market" : "Volver al mercado"}
            tabIndex={assistantRoute ? undefined : -1}
            className="liquid-glass__back"
          >
            <IconBack className="size-4" />
          </Link>
          <div id={AI_DOCK_SLOT_ID} className="liquid-glass__dock" />
        </div>
      </div>
    </nav>
  );
}
