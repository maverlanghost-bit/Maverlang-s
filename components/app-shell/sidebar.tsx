"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrandFavicon } from "@/components/app-shell/brand-image";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { openCommandPalette } from "@/components/app-shell/command-palette";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { readChatSnapshot, resolveChatScope, type ChatMessage } from "@/components/ai/model";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Avatar } from "@/components/ui/avatar";
import { IconChevron } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { AccountSwitch } from "@/components/app-shell/account-switch";
import { site } from "@/config/site";
import { asistenteText } from "@/content/i18n/extra-asistente";
import { shouldIgnoreSidebarShortcut, shouldToggleSidebarClick } from "@/lib/app-shell/sidebar";
import type { AccountMode } from "@/lib/account/mode";
import { useSession } from "@/lib/auth/session-context";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

const WIDTH_ANIMATION = "transition-[width] duration-200 ease-spring";

/** Título del historial real de la sesión (no hay conversaciones guardadas). */
const AI_RECENT_LABEL = {
  "es-CL": "Preguntas recientes",
  en: "Recent questions",
} as const;

function dispatchAiCommand(
  detail:
    | { type: "clear" }
    | { type: "attach" }
    | { type: "prompt"; id: "tesla" | "compare" | "portfolio" | "photo"; text: string },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mv-ai-command", { detail }));
}

function readRecentUserPrompts(messages: readonly ChatMessage[]): string[] {
  const prompts: string[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (!item || item.role !== "user") continue;
    const clean = item.text.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    prompts.push(clean);
    if (prompts.length >= 5) break;
  }
  return prompts;
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M13 8H3m0 0 4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SidebarPanelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  );
}

function ComposeChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M8.5 3H4a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 4 13h7a1.5 1.5 0 0 0 1.5-1.5V7.5" strokeLinecap="round" />
      <path d="m12.3 2.3 1.4 1.4-5.2 5.2-1.8.4.4-1.8 5.2-5.2Z" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2.2 1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  accountMode = "demo",
  onAccountChange,
}: {
  collapsed: boolean;
  onToggle: () => void;
  accountMode?: AccountMode;
  onAccountChange?: (mode: AccountMode) => void;
}) {
  const pathname = usePathname();
  const isAiRoute = pathname.startsWith("/app/asistente");
  const { t, language } = useT();
  const newChatLabel = asistenteText(language).clear;
  const recentLabel = AI_RECENT_LABEL[language];
  const account = useAccountLabel();
  const name = account.name;
  const loading = account.loading;
  /** Menú del perfil: Perfil, Ajustes, moneda y salir. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const session = useSession();
  const userId = session.user?.id ?? null;
  const chatScope = useMemo(() => resolveChatScope(session.status, userId), [session.status, userId]);
  const chatScopeKey = chatScope?.key ?? null;
  const [recent, setRecent] = useState<{ scopeKey: string | null; prompts: string[] }>({
    scopeKey: chatScopeKey,
    prompts: [],
  });
  /** Nunca mostrar la lista de otra identidad, ni siquiera en el frame previo al efecto. */
  const recentPrompts = recent.scopeKey === chatScopeKey ? recent.prompts : [];

  useEffect(() => {
    if (!isAiRoute) return;
    const sync = () => {
      const messages = chatScope ? readChatSnapshot(chatScope) : [];
      setRecent({ scopeKey: chatScopeKey, prompts: readRecentUserPrompts(messages) });
    };
    sync();
    window.addEventListener("mv-ai-chat", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mv-ai-chat", sync);
      window.removeEventListener("storage", sync);
    };
  }, [chatScope, chatScopeKey, isAiRoute]);

  /** Clic afuera cierra el menú del perfil. */
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node | null)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "b") return;
      if (shouldIgnoreSidebarShortcut(document.activeElement)) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);

  return (
    <aside
      onClick={(event) => {
        if (shouldToggleSidebarClick(event.target as Element | null)) onToggle();
      }}
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col overflow-visible border-r border-border/70 bg-surface-1/40 backdrop-blur-xl backdrop-saturate-180 lg:flex",
        WIDTH_ANIMATION,
        collapsed ? "w-[72px] cursor-e-resize" : "w-[220px] cursor-w-resize",
      )}
    >
      {isAiRoute ? (
        <>
          <div className={cn("flex items-center gap-1 py-3", collapsed ? "justify-center px-0" : "justify-between px-3")}>
            {collapsed ? (
              <Tooltip content={t.detail.backToMarket} side="right">
                <Link
                  href="/app"
                  aria-label={t.detail.backToMarket}
                  className="mx-auto flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-body outline-none transition hover:bg-surface-2 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <ArrowLeftIcon className="size-4" />
                </Link>
              </Tooltip>
            ) : (
              <>
                <Link
                  href="/app"
                  className="group flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-fg-body outline-none transition duration-150 ease-spring hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <ArrowLeftIcon className="size-4 shrink-0 text-fg-muted transition duration-150 group-hover:-translate-x-0.5 group-hover:text-fg" />
                  <span className="min-w-0 truncate">{t.detail.backToMarket}</span>
                </Link>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Alternar barra lateral"
                  title="Alternar barra lateral (⌘B)"
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted outline-none transition hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <SidebarPanelIcon className="size-4" />
                </button>
              </>
            )}
          </div>

          <nav aria-label={t.nav.label} className={cn("flex-1 overflow-y-auto pb-2", collapsed ? "px-3.5" : "px-2.5")}>
            <ul className="flex flex-col gap-1">
              <li>
                {collapsed ? (
                  <Tooltip content={newChatLabel} side="right">
                    <button
                      type="button"
                      aria-label={newChatLabel}
                      onClick={() => dispatchAiCommand({ type: "clear" })}
                      className="mx-auto flex size-11 cursor-pointer items-center justify-center rounded-xl bg-fg text-bg shadow-xs outline-none transition hover:bg-fg/90 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
                    >
                      <ComposeChatIcon className="size-4" />
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    onClick={() => dispatchAiCommand({ type: "clear" })}
                    className="flex min-h-11 w-full cursor-pointer items-center rounded-xl bg-fg pr-3 text-left text-sm font-medium text-bg shadow-xs outline-none transition hover:bg-fg/90 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <ComposeChatIcon className="size-4" />
                    </span>
                    <span className="min-w-0 truncate">{newChatLabel}</span>
                  </button>
                )}
              </li>
              <li>
                <StockSearchButton collapsed={collapsed} />
              </li>
            </ul>

            {!collapsed && recentPrompts.length > 0 ? (
              <section aria-labelledby="mv-ai-recent" className="mt-5 border-t border-border/60 pt-3">
                <h2
                  id="mv-ai-recent"
                  className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-fg-muted uppercase"
                >
                  {recentLabel}
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {recentPrompts.map((promptText) => (
                    <li key={promptText}>
                      <button
                        type="button"
                        title={promptText}
                        onClick={() => dispatchAiCommand({ type: "prompt", id: "tesla", text: promptText })}
                        className="group flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-xs leading-snug text-fg-muted outline-none transition duration-150 ease-spring hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                      >
                        <HistoryChatIcon className="size-3.5 shrink-0 text-fg-muted transition group-hover:text-fg" />
                        <span className="min-w-0 truncate">{promptText}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </nav>

          <div className={cn("border-t border-border/70", collapsed ? "px-3.5 py-3" : "px-3 py-3")}>
            <div
              ref={menuRef}
              className="relative"
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
            >
              {menuOpen && !collapsed && !loading ? (
                <div
                  role="menu"
                  aria-label={t.shell.account}
                  className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-1 rounded-xl border border-border/70 bg-bg p-2 shadow-float"
                >
                  <Link
                    role="menuitem"
                    href="/app/perfil"
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {t.nav.profile}
                  </Link>
                  <Link
                    role="menuitem"
                    href="/app/ajustes"
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {t.nav.settings}
                  </Link>
                  <div className="flex justify-start px-3 py-2">
                    <CurrencySwitch />
                  </div>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => void account.logout()}
                    disabled={account.status === "loading"}
                    className="flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-40"
                  >
                    {t.profile.logout}
                  </button>
                </div>
              ) : null}
              {loading ? (
                <div className="flex min-h-11 items-center rounded-xl">
                  <span className="flex size-11 shrink-0 items-center justify-center">
                    <Skeleton className="size-10 rounded-full" />
                  </span>
                  {!collapsed ? <Skeleton className="h-4 w-24" /> : null}
                </div>
              ) : collapsed ? (
                <Tooltip content={name || t.shell.account} side="right">
                  <Link
                    href="/app/perfil"
                    aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
                    title={loading ? t.shell.account : name}
                    className="mx-auto flex size-11 cursor-pointer items-center justify-center rounded-xl outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <Avatar alt="" fallback={name} size="md" className="size-10" />
                    </span>
                  </Link>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={`${name}. ${t.shell.account}`}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex min-h-11 w-full cursor-pointer items-center rounded-xl text-left outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center">
                    <Avatar alt="" fallback={name} size="md" className="size-10" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{name}</span>
                    {account.email ? <span className="block truncate text-xs text-fg-muted">{account.email}</span> : null}
                  </span>
                  <IconChevron className={cn("size-4 shrink-0 text-fg-muted transition duration-200", menuOpen && "rotate-180")} />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Marca: el mismo archivo que el favicon. Mismo slot fijo que los íconos. */}
          <div className={cn("flex items-center py-3", collapsed ? "justify-center px-0" : "justify-between px-3")}>
            <Link
              href="/app"
              aria-label={site.name}
              title={site.name}
              className="flex min-h-11 cursor-pointer items-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              <span className="flex size-11 shrink-0 items-center justify-center">
                <BrandFavicon className="w-10" />
              </span>
            </Link>
            {!collapsed ? (
              <button
                type="button"
                onClick={() => openCommandPalette()}
                aria-label="Abrir paleta de comandos ⌘K"
                className="mr-1 inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-fg-muted shadow-[0_1px_2px_rgba(12,15,20,0.04)] transition hover:bg-surface-2 hover:text-fg"
              >
                <span>⌘K</span>
              </button>
            ) : null}
          </div>
          <nav aria-label={t.nav.label} className={cn("flex-1", collapsed ? "px-3.5" : "px-2.5")}>
            <ul className="flex flex-col gap-1">
              <li>
                <StockSearchButton collapsed={collapsed} />
              </li>
              {shellNav.filter((item) => item.id !== "profile").map((item) => {
                const active = isShellSectionActive(pathname, item.id);
                const Icon = item.icon;
                const link = (
                  <Link
                    href={item.href}
                    aria-label={collapsed ? t.nav[item.id] : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center rounded-xl text-sm outline-none transition duration-200 ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
                      collapsed ? "mx-auto size-11 justify-center gap-0 px-0" : "w-full gap-2.5 px-1",
                      active
                        ? "bg-fg/[0.06] font-medium text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_3px_rgba(12,15,20,0.05)] ring-1 ring-border/60"
                        : "text-fg-body hover:bg-fg/[0.04] hover:text-fg",
                    )}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <Icon className="size-4" />
                    </span>
                    <span
                      className={cn(
                        "overflow-hidden whitespace-nowrap transition-all duration-200 ease-spring",
                        collapsed ? "sr-only" : "truncate",
                      )}
                    >
                      {t.nav[item.id]}
                    </span>
                  </Link>
                );
                return (
                  <li key={item.id}>
                    {collapsed ? (
                      <Tooltip content={t.nav[item.id]} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className={cn("border-t border-border/70", collapsed ? "px-3.5 py-3" : "px-3 py-3")}>
            {!collapsed ? (
              <>
                <BalanceHeader variant="sidebar" />
                <div className="mt-2.5">
                  <AccountSwitch mode={accountMode} onChange={onAccountChange ?? (() => {})} />
                </div>
              </>
            ) : null}
            <div
              ref={menuRef}
              className={cn("relative", !collapsed && "mt-2.5")}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
            >
              {menuOpen && !collapsed && !loading ? (
                <div
                  role="menu"
                  aria-label={t.shell.account}
                  className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-1 rounded-xl border border-border/70 bg-bg p-2 shadow-float"
                >
                  <Link
                    role="menuitem"
                    href="/app/perfil"
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {t.nav.profile}
                  </Link>
                  <Link
                    role="menuitem"
                    href="/app/ajustes"
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {t.nav.settings}
                  </Link>
                  <div className="flex justify-start px-3 py-2">
                    <CurrencySwitch />
                  </div>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => void account.logout()}
                    disabled={account.status === "loading"}
                    className="flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-sm text-fg-body outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-40"
                  >
                    {t.profile.logout}
                  </button>
                </div>
              ) : null}
              {loading ? (
                <div className="flex min-h-11 items-center rounded-xl">
                  <span className="flex size-11 shrink-0 items-center justify-center">
                    <Skeleton className="size-10 rounded-full" />
                  </span>
                  {!collapsed ? <Skeleton className="h-4 w-24" /> : null}
                </div>
              ) : collapsed ? (
                <Tooltip content={name || t.shell.account} side="right">
                  <Link
                    href="/app/perfil"
                    aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
                    title={loading ? t.shell.account : name}
                    className="mx-auto flex size-11 cursor-pointer items-center justify-center rounded-xl outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <Avatar alt="" fallback={name} size="md" className="size-10" />
                    </span>
                  </Link>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={`${name}. ${t.shell.account}`}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex min-h-11 w-full cursor-pointer items-center rounded-xl text-left outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center">
                    <Avatar alt="" fallback={name} size="md" className="size-10" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{name}</span>
                    {account.email ? <span className="block truncate text-xs text-fg-muted">{account.email}</span> : null}
                  </span>
                  <IconChevron className={cn("size-4 shrink-0 text-fg-muted transition duration-200", menuOpen && "rotate-180")} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
