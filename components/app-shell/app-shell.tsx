"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { BottomTabs } from "@/components/app-shell/bottom-tabs";
import { isBarePlatformPath } from "@/components/app-shell/nav";
import { PublicHeader } from "@/components/app-shell/public-header";
import { Sidebar } from "@/components/app-shell/sidebar";
import { TopBar } from "@/components/app-shell/top-bar";
import { serializeSidebarCookie } from "@/lib/app-shell/sidebar";
import { useT } from "@/lib/hooks/use-t";

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

/** Sin tabs privadas, la barra de la ficha queda al borde de la pantalla. */
function ClearPrivateTabs() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-tabs-height", "0px");
    return () => {
      root.style.removeProperty("--app-tabs-height");
    };
  }, []);
  return null;
}

function ShellFrame({ children, sidebarCollapsed }: { children: ReactNode; sidebarCollapsed: boolean }) {
  const { t, language } = useT();
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  const toggleSidebar = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      document.cookie = serializeSidebarCookie(next ? "collapsed" : "expanded");
      return next;
    });
  }, []);

  return (
    <div className="relative min-h-dvh bg-bg">
      <SyncDocumentLanguage language={language} />
      <SyncToastOffset includeTabs />
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        {t.shell.skip}
      </a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <div className="flex min-h-dvh min-w-0 flex-col">
          <TopBar />
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pt-6 lg:px-8 lg:pt-8">
            <main id="contenido" tabIndex={-1} className="flex-1 scroll-mt-16 outline-none">
              {children}
            </main>
            <footer className="pb-[calc(var(--app-tabs-height)+1rem+var(--app-detail-cta))] pt-10 lg:pb-8">
              <p className="border-t border-border pt-4 text-sm leading-relaxed text-fg-muted">{t.disclaimer}</p>
            </footer>
          </div>
        </div>
      </div>
      <BottomTabs />
    </div>
  );
}

function PublicFrame({ children }: { children: ReactNode }) {
  const { t, language } = useT();

  return (
    <div className="relative min-h-dvh bg-bg">
      <SyncDocumentLanguage language={language} />
      <ClearPrivateTabs />
      <SyncToastOffset includeTabs={false} />
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        {t.shell.skip}
      </a>
      <PublicHeader />
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col px-5 pt-6 lg:px-8">
        <main id="contenido" tabIndex={-1} className="flex-1 scroll-mt-16 outline-none">
          {children}
        </main>
        <footer className="pb-[calc(1rem+var(--app-detail-cta))] pt-10 lg:pb-8">
          <p className="border-t border-border pt-4 text-sm leading-relaxed text-fg-muted">{t.disclaimer}</p>
        </footer>
      </div>
    </div>
  );
}

export function AppShell({
  signedIn,
  sidebarCollapsed = false,
  children,
}: {
  signedIn: boolean;
  sidebarCollapsed?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (isBarePlatformPath(pathname)) return children;
  if (!signedIn) return <PublicFrame>{children}</PublicFrame>;
  return <ShellFrame sidebarCollapsed={sidebarCollapsed}>{children}</ShellFrame>;
}
