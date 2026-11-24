"use client";

import { useEffect, useRef, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  AI_DOCK_SLOT_ID,
  activeMobileTab,
  mobileTabs,
  shellTabLabel,
} from "@/components/app-shell/nav";
import { IconStar } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/**
 * Publica el alto de la barra para la barra de compra, los toasts y el padding
 * del contenido. En /app/asistente y en la ficha la barra no se monta: alto 0px.
 */
function useTabsHeight(ref: RefObject<HTMLElement | null>, hidden: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const nav = ref.current;
      if (hidden || query.matches || !nav) {
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
  }, [ref, hidden]);
}

/**
 * Barra inferior móvil (< lg): blanca sólida, borde superior fino, cinco
 * pestañas con ícono de 24px y etiqueta de 11px. La activa va en `text-fg`
 * semibold con un trazo superior; las demás en `text-fg-muted`.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const { t, language } = useT();
  const navRef = useRef<HTMLElement>(null);
  const assistantRoute =
    pathname === "/app/asistente" || pathname.startsWith("/app/asistente/");
  const activeIndex = activeMobileTab(pathname);
  // La ficha de una acción usa su propia tarjeta inferior de Comprar/Vender.
  const stockDetailRoute = pathname.startsWith("/app/accion/");
  const hidden = assistantRoute || stockDetailRoute;
  useTabsHeight(navRef, hidden);

  // El chat tiene su propio compositor y barra superior: aquí no se monta.
  if (hidden) return null;

  return (
    <nav
      ref={navRef}
      aria-label={t.nav.label}
      data-hidden="false"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* Ranura del dock de IA (la usa el compositor del asistente; vacía fuera de él). */}
      <div id={AI_DOCK_SLOT_ID} className="empty:hidden" />
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {mobileTabs.map((item, index) => {
          const active = index === activeIndex;
          const Icon = item.icon;
          const label = shellTabLabel(language, item.id, t.nav);
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-h-11 w-full touch-manipulation flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-none outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-fg",
                  active ? "font-semibold text-fg" : "font-medium text-fg-muted",
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-fg" />
                ) : null}
                {item.id === "favorites" ? (
                  <IconStar filled={active} className="size-6" />
                ) : (
                  <Icon className="size-6" />
                )}
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
