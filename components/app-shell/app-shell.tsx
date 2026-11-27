"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { BottomTabs } from "@/components/app-shell/bottom-tabs";
import { isBarePlatformPath } from "@/components/app-shell/nav";
import { PublicHeader } from "@/components/app-shell/public-header";
import { Sidebar } from "@/components/app-shell/sidebar";
import { StockSearchRoot } from "@/components/app-shell/stock-search";
import { TopBar } from "@/components/app-shell/top-bar";
import { cn } from "@/lib/cn";
import { APP_SCROLL_ID } from "@/lib/app-shell/scroll";
import {
  clampSidebarWidth,
  serializeSidebarCookie,
  serializeSidebarWidthCookie,
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
} from "@/lib/app-shell/sidebar";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useT } from "@/lib/hooks/use-t";
import type { AccountMode } from "@/lib/account/mode";

function SyncDocumentLanguage({ language }: { language: "es-CL" | "en" }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    if (previous === language) return;
    root.lang = language;
    return () => {
      root.lang = previous;
    };
  }, [language]);
  return null;
}

/** Deja el toast por encima de las tabs y, en el detalle, de la barra de compra. En ≥lg no hay barra. */
function SyncToastOffset({ includeTabs }: { includeTabs: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const mobile = includeTabs
        ? "calc(var(--app-tabs-height) + var(--app-detail-cta))"
        : "var(--app-detail-cta)";
      root.style.setProperty("--app-chrome-bottom", query.matches ? "0px" : mobile);
    };
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      root.style.removeProperty("--app-chrome-bottom");
    };
  }, [includeTabs]);
  return null;
}


function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#contenido"
      className="sr-only focus:not-sr-only focus:fixed focus:top-[max(0.75rem,env(safe-area-inset-top))] focus:left-4 focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-fg focus:px-5 focus:text-sm focus:font-medium focus:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong"
    >
      {label}
    </a>
  );
}

function ShellFrame({
  children,
  sidebarCollapsed,
  sidebarWidth,
  accountInitial,
}: {
  children: ReactNode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  accountInitial: AccountMode;
}) {
  const { t, language } = useT();
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  const [width, setWidth] = useState(sidebarWidth);
  const [dragging, setDragging] = useState(false);
  /** Espejo para escribir cookies al soltar sin depender de closures viejos. */
  const latest = useRef({ collapsed: sidebarCollapsed, width: sidebarWidth });
  const applyWidth = useCallback((nextCollapsed: boolean, nextWidth: number) => {
    latest.current = { collapsed: nextCollapsed, width: nextWidth };
    setCollapsed(nextCollapsed);
    setWidth(nextWidth);
  }, []);
  const persistSidebar = useCallback(() => {
    document.cookie = serializeSidebarCookie(latest.current.collapsed ? "collapsed" : "expanded");
    document.cookie = serializeSidebarWidthCookie(latest.current.width);
  }, []);
  /** Ancho bruto arrastrado: bajo el umbral colapsa, si no acota entre mín y máx. */
  const resizeTo = useCallback(
    (raw: number) => {
      if (raw < SIDEBAR_COLLAPSE_THRESHOLD) applyWidth(true, latest.current.width);
      else applyWidth(false, clampSidebarWidth(raw));
    },
    [applyWidth],
  );
  const resetWidth = useCallback(() => {
    applyWidth(false, SIDEBAR_DEFAULT_WIDTH);
    persistSidebar();
  }, [applyWidth, persistSidebar]);
  const account = useAccountMode(accountInitial);
  const pathname = usePathname();
  const assistantRoute = pathname === "/app/asistente" || pathname.startsWith("/app/asistente/");
  const scrollRef = useRef<HTMLDivElement>(null);
  // En lg+ el scroll es del panel, no de la ventana: al cambiar de ruta vuelve arriba (salvo anclas).
  useEffect(() => {
    if (window.location.hash) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pathname]);
  const toggleSidebar = useCallback(() => {
    applyWidth(!latest.current.collapsed, latest.current.width);
    persistSidebar();
  }, [applyWidth, persistSidebar]);
  const railWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

  return (
    <div
      className="relative min-h-dvh bg-canvas lg:h-dvh lg:overflow-hidden"
      style={
        {
          "--app-sidebar-width": `${railWidth}px`,
        } as CSSProperties
      }
    >
      <SyncDocumentLanguage language={language} />
      <SyncToastOffset includeTabs />
      <SkipLink label={t.shell.skip} />
      <StockSearchRoot>
        <div className="min-h-dvh lg:grid lg:h-dvh lg:grid-cols-[auto_minmax(0,1fr)]">
          <Sidebar
            collapsed={collapsed}
            width={railWidth}
            dragging={dragging}
            onToggle={toggleSidebar}
            onResize={resizeTo}
            onResizeStart={() => setDragging(true)}
            onResizeEnd={() => {
              setDragging(false);
              persistSidebar();
            }}
            onResetWidth={resetWidth}
            accountMode={account.mode}
            onAccountChange={account.select}
          />
          <div
            id={APP_SCROLL_ID}
            ref={scrollRef}
            className="flex min-h-dvh min-w-0 flex-col lg:m-2 lg:ml-0 lg:h-[calc(100dvh-16px)] lg:min-h-0 lg:scroll-pt-4 lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-border lg:bg-bg lg:shadow-sm"
          >
            <TopBar accountMode={account.mode} hideMobileCluster={assistantRoute} />
            <div
              className={cn(
                "mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col px-5 pb-[var(--app-tabs-height)] lg:px-8 lg:pb-0 lg:pt-8",
                assistantRoute ? "pt-0" : "pt-[calc(env(safe-area-inset-top)+4rem)]",
              )}
            >
              <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 scroll-mt-16 outline-none">
                {children}
              </main>
              <footer className="pb-[calc(1rem+var(--app-detail-cta))] pt-8 lg:pb-8">
                <p className="border-t border-border pt-4 text-[13px] leading-relaxed text-fg-muted">{t.disclaimer}</p>
              </footer>
            </div>
          </div>
        </div>
        <BottomTabs />
      </StockSearchRoot>
    </div>
  );
}

function PublicFrame({ children }: { children: ReactNode }) {
  const { t, language } = useT();

  return (
    <div
      className="relative min-h-dvh bg-bg"
      style={{ "--app-sidebar-width": "0px" } as CSSProperties}
    >
      <SyncDocumentLanguage language={language} />
      <SyncToastOffset includeTabs />
      <SkipLink label={t.shell.skip} />
      <StockSearchRoot>
        <PublicHeader />
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col px-5 pt-4 pb-[var(--app-tabs-height)] sm:pt-6 lg:px-8 lg:pt-10 lg:pb-0">
          <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 scroll-mt-16 outline-none">
            {children}
          </main>
          <footer className="pb-[calc(1rem+var(--app-detail-cta)+env(safe-area-inset-bottom))] pt-8 lg:pb-8">
            <p className="border-t border-border pt-4 text-[13px] leading-relaxed text-fg-muted">{t.disclaimer}</p>
          </footer>
        </div>
        <BottomTabs guest />
      </StockSearchRoot>
    </div>
  );
}

export function AppShell({
  signedIn,
  sidebarCollapsed = false,
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
  accountMode = "demo",
  children,
}: {
  signedIn: boolean;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  accountMode?: AccountMode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (isBarePlatformPath(pathname)) return children;
  if (!signedIn) return <PublicFrame>{children}</PublicFrame>;
  return (
    <ShellFrame sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} accountInitial={accountMode}>
      {children}
    </ShellFrame>
  );
}
