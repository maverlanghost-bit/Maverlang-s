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
import { NavChatsHistory } from "@/components/ai/nav-chats";
import { useSavedChats } from "@/components/ai/sessions-live";
import type { SavedChatItem } from "@/components/ai/sessions-store";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Avatar } from "@/components/ui/avatar";
import { IconChevron } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { AccountSwitch } from "@/components/app-shell/account-switch";
import { site } from "@/config/site";
import { shouldIgnoreSidebarShortcut, shouldToggleSidebarClick } from "@/lib/app-shell/sidebar";
import type { AccountMode } from "@/lib/account/mode";
import { useSession } from "@/lib/auth/session-context";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

const WIDTH_ANIMATION = "transition-[width] duration-200 ease-spring";

const SELECT_EVENT = "maverlang:ai-select-chat";
const ACTION_EVENT = "maverlang:ai-chat-action";

type SidebarChatAction =
  | { type: "rename"; chatId: string; title: string }
  | { type: "pin"; chatId: string }
  | { type: "delete"; chatId: string }
  | { type: "share"; chatId: string };

/**
 * El sidebar no escribe el historial: la pantalla del asistente es la única
 * dueña del store. Aquí sólo se piden acciones por evento.
 */
function dispatchAiAction(detail: SidebarChatAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail }));
}

function dispatchAiCommand(
  detail:
    | { type: "clear" }
    | { type: "attach" }
    | { type: "prompt"; id: "tesla" | "compare" | "portfolio" | "photo"; text: string },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mv-ai-command", { detail }));
}

/** Misma conversación activa que calcula la pantalla, sin duplicar el id. */
function matchChatId(chats: readonly SavedChatItem[], messages: readonly ChatMessage[]): string | null {
  if (messages.length === 0) return null;
  const first = messages.find((item) => item.role === "user")?.text ?? "";
  const match = chats.find(
    (chat) =>
      chat.messages.length === messages.length &&
      (chat.messages.find((item) => item.role === "user")?.text ?? "") === first,
  );
  return match?.id ?? null;
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M13 8H3m0 0 4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PanelLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function PanelLeftCloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );
}

function MessageSquarePlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h9" />
      <path d="M18 2v6" />
      <path d="M15 5h6" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
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
  /** Mismo texto que usa NavChatsHistory para estrenar conversación. */
  const newChatLabel = language === "en" ? "New chat" : "Nuevo chat";
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
  const savedChats = useSavedChats(chatScopeKey);
  const [activeChat, setActiveChat] = useState<{ scopeKey: string | null; chatId: string | null }>({
    scopeKey: chatScopeKey,
    chatId: null,
  });
  /** Nunca mostrar el estado de otra identidad, ni siquiera antes del efecto. */
  const activeChatId = activeChat.scopeKey === chatScopeKey ? activeChat.chatId : null;

  useEffect(() => {
    if (!isAiRoute) return;
    const sync = () => {
      const messages = chatScope ? readChatSnapshot(chatScope) : [];
      setActiveChat({ scopeKey: chatScopeKey, chatId: matchChatId(savedChats, messages) });
    };
    sync();
    window.addEventListener("mv-ai-chat", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("maverlang:ai-sessions-changed", sync);
    return () => {
      window.removeEventListener("mv-ai-chat", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("maverlang:ai-sessions-changed", sync);
    };
  }, [chatScope, chatScopeKey, isAiRoute, savedChats]);

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
          <div className={cn("flex w-full gap-1", collapsed ? "flex-col items-center py-2" : "items-center py-2 pl-3 pr-2")}>
            <Link
              href="/app"
              aria-label={t.detail.backToMarket}
              className={cn(
                "group flex min-w-0 cursor-pointer items-center gap-2 outline-none",
                collapsed ? "flex-none justify-center" : "flex-1",
              )}
            >
              <div className="relative flex items-center justify-center size-7 rounded-lg bg-zinc-900/5 shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/Maverlang Logo-2.png" alt="Maverlang" className="size-5 object-contain" />
              </div>
              {collapsed ? null : (
                <span className="text-sm font-semibold tracking-tight text-zinc-900 truncate">Maverlang AI</span>
              )}
            </Link>
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
              title={`${collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar} (Ctrl+B)`}
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 outline-none transition hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              {collapsed ? <PanelLeftIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
            </button>
          </div>

          <nav aria-label={t.nav.label} className="flex-1 overflow-y-auto px-3.5 pb-2">
            {collapsed ? (
              <ul className="flex flex-col items-center gap-1">
                <li>
                  <Tooltip content={newChatLabel} side="right">
                    <button
                      type="button"
                      aria-label={newChatLabel}
                      onClick={() => dispatchAiCommand({ type: "clear" })}
                      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
                    >
                      <MessageSquarePlusIcon className="size-4" />
                    </button>
                  </Tooltip>
                </li>
                <li>
                  <Tooltip content={t.shell.search} side="right">
                    <button
                      type="button"
                      aria-label={t.shell.search}
                      onClick={() => {
                        if (typeof window === "undefined") return;
                        window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: { type: "search" } }));
                      }}
                      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
                    >
                      <SearchIcon className="size-4" />
                    </button>
                  </Tooltip>
                </li>
                <li>
                  <Tooltip content={t.detail.backToMarket} side="right">
                    <Link
                      href="/app"
                      aria-label={t.detail.backToMarket}
                      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
                    >
                      <ArrowLeftIcon className="size-4" />
                    </Link>
                  </Tooltip>
                </li>
              </ul>
            ) : (
              <>
                <ul className="flex flex-col gap-1">
                  <li>
                    <button
                      type="button"
                      onClick={() => dispatchAiCommand({ type: "clear" })}
                      className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      <MessageSquarePlusIcon className="size-4 shrink-0" />
                      <span className="truncate">{newChatLabel}</span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window === "undefined") return;
                        window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: { type: "search" } }));
                      }}
                      className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      <SearchIcon className="size-4 shrink-0" />
                      <span className="truncate">{t.shell.search}</span>
                    </button>
                  </li>
                  <li>
                    <Link
                      href="/app"
                      className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      <ArrowLeftIcon className="size-4 shrink-0" />
                      <span className="truncate">{t.detail.backToMarket}</span>
                    </Link>
                  </li>
                </ul>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <NavChatsHistory
                    chats={savedChats}
                    activeChatId={activeChatId}
                    onSelectChat={(chatId) => {
                      if (typeof window === "undefined") return;
                      window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: { chatId } }));
                    }}
                    onNewChat={() => dispatchAiCommand({ type: "clear" })}
                    onRenameChat={(chatId, title) => dispatchAiAction({ type: "rename", chatId, title })}
                    onTogglePinChat={(chatId) => dispatchAiAction({ type: "pin", chatId })}
                    onDeleteChat={(chatId) => dispatchAiAction({ type: "delete", chatId })}
                    onShareChat={(chatId) => dispatchAiAction({ type: "share", chatId })}
                  />
                </div>
              </>
            )}
          </nav>

          <div className="border-t border-border/70 px-3.5 py-3">
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
                    className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
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
                  className="flex min-h-11 w-full cursor-pointer items-center gap-1.5 rounded-xl text-left outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
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
          {/* Marca: padding izquierdo fijo (px-3.5 = 14px) para que el slot size-11 (44px)
              quede clavado exactamente en el centro de los 72px colapsados (14+44+14=72)
              y jamás se desplace de derecha a izquierda al colapsar o expandir. */}
          <div className="flex items-center justify-between px-3.5 py-3">
            <Link
              href="/app"
              aria-label={site.name}
              title={site.name}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
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
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-fg-muted shadow-[0_1px_2px_rgba(12,15,20,0.04)] transition hover:bg-surface-2 hover:text-fg"
              >
                <span>⌘K</span>
              </button>
            ) : null}
          </div>
          <nav aria-label={t.nav.label} className="flex-1 px-3.5">
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
                      "flex min-h-11 cursor-pointer items-center rounded-xl text-sm outline-none transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
                      collapsed ? "size-11 justify-start gap-0 px-0" : "w-full justify-start gap-1.5 pr-2 pl-0",
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
                        "overflow-hidden whitespace-nowrap",
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
          <div className="border-t border-border/70 px-3.5 py-3">
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
                    className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
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
                  className="flex min-h-11 w-full cursor-pointer items-center gap-1.5 rounded-xl text-left outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
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
