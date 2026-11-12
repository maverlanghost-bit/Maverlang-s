"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrandFavicon } from "@/components/app-shell/brand-image";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import {
  isShellSectionActive,
  shellTabLabel,
  sidebarPrimary,
  sidebarUtility,
} from "@/components/app-shell/nav";
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
import { shouldIgnoreSidebarShortcut } from "@/lib/app-shell/sidebar";
import type { AccountMode } from "@/lib/account/mode";
import { useSession } from "@/lib/auth/session-context";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

const WIDTH_ANIMATION = "transition-[width] duration-200 ease-spring";

const SELECT_EVENT = "maverlang:ai-select-chat";
const ACTION_EVENT = "maverlang:ai-chat-action";

/**
 * Fila base del riel: 44px de alto. Sin íconos cuando hay texto: la jerarquía
 * la hacen el peso, el color y el fondo; el ícono sólo aparece en el riel
 * colapsado (con tooltip), donde no cabe la etiqueta.
 *
 * El estado activo es una píldora blanca con hairline de control: se distingue
 * por forma y por borde, no por sombra (en modo claro la sombra casi no existe).
 */
const ROW_BASE =
  "group relative flex cursor-pointer items-center rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";
const ROW_EXPANDED = "min-h-11 w-full gap-2.5 px-3 text-sm";
const ROW_HOVER = "hover:bg-fg/[0.055] hover:text-fg";
const ROW_ACTIVE = "bg-bg font-medium text-fg ring-1 ring-border-strong/60";

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
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
      <path d="M13 8H3m0 0 3.5-3.5M3 8l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PanelLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.75" />
      <path d="M6.25 3v10" />
    </svg>
  );
}

function PanelLeftCloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.75" />
      <path d="M6.25 3v10" />
      <path d="M11.25 9.5 9.75 8l1.5-1.5" />
    </svg>
  );
}

function MessageSquarePlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M13.5 9.2a1.6 1.6 0 0 1-1.6 1.6H5.6L3 13.2V3.9a1.6 1.6 0 0 1 1.6-1.6h5.3" />
      <path d="M11.6 1.8v4M9.6 3.8h4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="7.2" cy="7.2" r="4.45" />
      <path d="m10.6 10.6 2.9 2.9" />
    </svg>
  );
}

type AccountMenuLabels = {
  account: string;
  profile: string;
  settings: string;
  currency: string;
  logout: string;
};

/**
 * Menú del perfil: Perfil, Ajustes, moneda y salir.
 * Se abre hacia arriba desde el pie del riel, alineado a su ancho.
 */
function AccountMenuPanel({
  open,
  onClose,
  onLogout,
  logoutDisabled,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  logoutDisabled: boolean;
  labels: AccountMenuLabels;
}) {
  if (!open) return null;

  const item =
    "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-fg-body transition-colors hover:bg-surface-1 hover:text-fg";

  return (
    <div
      role="menu"
      aria-label={labels.account}
      className="absolute inset-x-0 bottom-full z-40 mb-2 flex flex-col rounded-xl border border-border bg-bg p-1.5 shadow-float"
    >
      <Link role="menuitem" href="/app/perfil" onClick={onClose} className={item}>
        {labels.profile}
      </Link>
      <Link role="menuitem" href="/app/ajustes" onClick={onClose} className={item}>
        {labels.settings}
      </Link>
      <div role="presentation" className="my-1 h-px bg-border" />
      <div className="flex min-h-11 items-center justify-between gap-2 pl-3 pr-1">
        <span className="label-xs">{labels.currency}</span>
        <CurrencySwitch compact />
      </div>
      <div role="presentation" className="my-1 h-px bg-border" />
      <button
        role="menuitem"
        type="button"
        onClick={onLogout}
        disabled={logoutDisabled}
        className={cn(item, "disabled:opacity-40")}
      >
        {labels.logout}
      </button>
    </div>
  );
}

function AccountTrigger({
  name,
  email,
  label,
  open,
  onClick,
}: {
  name: string;
  email: string | null;
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-fg/[0.04]"
    >
      <Avatar alt="" fallback={name} size="sm" className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5 text-fg">{name}</span>
        {email ? <span className="block truncate text-xs leading-4 text-fg-muted">{email}</span> : null}
      </span>
      <IconChevron
        className={cn(
          "size-3.5 shrink-0 text-fg-muted transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </button>
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

  const menuLabels: AccountMenuLabels = {
    account: t.shell.account,
    profile: t.nav.profile,
    settings: t.nav.settings,
    currency: t.shell.currencyLabel,
    logout: t.profile.logout,
  };

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

  /**
   * Fila de navegación. Con el riel abierto es sólo texto: la jerarquía la
   * marcan el peso, el color y el fondo, sin íconos decorativos. Colapsada
   * pasa a ícono con tooltip, porque la etiqueta no cabe en 72px.
   */
  function navRow(
    item: (typeof sidebarPrimary)[number] | (typeof sidebarUtility)[number],
    utility: boolean,
  ) {
    const active = isShellSectionActive(pathname, item.id);
    const label = shellTabLabel(language, item.id, t.nav);
    const Icon = item.icon;
    const link = (
      <Link
        href={item.href}
        aria-label={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          ROW_BASE,
          collapsed ? "size-11 justify-center" : ROW_EXPANDED,
          active ? ROW_ACTIVE : cn(utility ? "text-fg-muted" : "text-fg-body", ROW_HOVER),
        )}
      >
        {collapsed ? (
          <Icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-muted group-hover:text-fg")} />
        ) : null}
        <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
      </Link>
    );
    return collapsed ? (
      <Tooltip content={label} side="right">
        {link}
      </Tooltip>
    ) : (
      link
    );
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col overflow-visible border-r border-border bg-surface-1 lg:flex",
        WIDTH_ANIMATION,
        collapsed ? "w-[76px]" : "w-[240px]",
      )}
    >
      {/* Marca. El slot de 44px queda centrado en los 76px del riel colapsado
          (16 + 44 + 16 = 76), así el isotipo no se mueve al colapsar. */}
      <div
        className={cn(
          "flex shrink-0 items-center px-4 pt-3",
          collapsed ? "justify-center pb-1" : "justify-between pb-1.5",
        )}
      >
        <Link
          href="/app"
          aria-label={isAiRoute ? t.detail.backToMarket : site.name}
          title={isAiRoute ? t.detail.backToMarket : site.name}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-opacity hover:opacity-70"
        >
          {isAiRoute ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/assets/Maverlang Logo-2.png" alt={site.name} className="size-7 object-contain" />
          ) : (
            <BrandFavicon className="w-10" />
          )}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={t.shell.collapseSidebar}
            title={`${t.shell.collapseSidebar} (Ctrl+B)`}
            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-fg/[0.055] hover:text-fg"
          >
            <PanelLeftCloseIcon className="size-4" />
          </button>
        ) : null}
      </div>
      {collapsed ? (
        <div className="flex shrink-0 justify-center pb-1.5">
          <Tooltip content={`${t.shell.expandSidebar} (Ctrl+B)`} side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label={t.shell.expandSidebar}
              className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-fg/[0.055] hover:text-fg"
            >
              <PanelLeftIcon className="size-4" />
            </button>
          </Tooltip>
        </div>
      ) : null}

      <nav aria-label={t.nav.label} className="flex-1 overflow-y-auto px-4 pt-1 pb-2">
        {isAiRoute ? (
          collapsed ? (
            <ul className="flex flex-col items-center gap-0.5">
              <li>
                <Tooltip content={newChatLabel} side="right">
                  <button
                    type="button"
                    aria-label={newChatLabel}
                    onClick={() => dispatchAiCommand({ type: "clear" })}
                    className={cn(ROW_BASE, ROW_HOVER, "size-11 justify-center text-fg-muted")}
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
                    className={cn(ROW_BASE, ROW_HOVER, "size-11 justify-center text-fg-muted")}
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
                    className={cn(ROW_BASE, ROW_HOVER, "size-11 justify-center text-fg-muted")}
                  >
                    <ArrowLeftIcon className="size-4" />
                  </Link>
                </Tooltip>
              </li>
            </ul>
          ) : (
            <>
              <ul className="flex flex-col gap-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => dispatchAiCommand({ type: "clear" })}
                    className={cn(ROW_BASE, ROW_EXPANDED, ROW_HOVER, "text-fg-body")}
                  >
                    <MessageSquarePlusIcon className="size-4 shrink-0 text-fg-muted" />
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
                    className={cn(ROW_BASE, ROW_EXPANDED, ROW_HOVER, "text-fg-body")}
                  >
                    <SearchIcon className="size-4 shrink-0 text-fg-muted" />
                    <span className="truncate">{t.shell.search}</span>
                  </button>
                </li>
                <li>
                  <Link href="/app" className={cn(ROW_BASE, ROW_EXPANDED, ROW_HOVER, "text-fg-body")}>
                    <ArrowLeftIcon className="size-4 shrink-0 text-fg-muted" />
                    <span className="truncate">{t.detail.backToMarket}</span>
                  </Link>
                </li>
              </ul>

              <div className="mt-3 border-t border-border pt-2">
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
          )
        ) : (
          <>
            <ul className="flex flex-col gap-0.5">
              {sidebarPrimary.map((item) => (
                <li key={item.id}>{navRow(item, false)}</li>
              ))}
            </ul>
            <div aria-hidden className="mx-1 my-2 h-px bg-border" />
            <ul className="flex flex-col gap-0.5">
              {sidebarUtility.map((item) => (
                <li key={item.id}>{navRow(item, true)}</li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <footer className="shrink-0 border-t border-border px-4 py-3">
        {!isAiRoute && !collapsed ? (
          <>
            <BalanceHeader variant="sidebar" className="bg-bg" />
            <div className="mt-2">
              <AccountSwitch mode={accountMode} onChange={onAccountChange ?? (() => {})} />
            </div>
          </>
        ) : null}

        <div
          ref={menuRef}
          className={cn("relative", !isAiRoute && !collapsed && "mt-2")}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
        >
          <AccountMenuPanel
            open={menuOpen && !collapsed && !loading}
            onClose={() => setMenuOpen(false)}
            onLogout={() => void account.logout()}
            logoutDisabled={account.status === "loading"}
            labels={menuLabels}
          />
          {loading ? (
            <div className="flex min-h-11 items-center rounded-lg px-1.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              {!collapsed ? <Skeleton className="ml-2.5 h-3.5 w-24" /> : null}
            </div>
          ) : collapsed ? (
            <Tooltip content={name || t.shell.account} side="right">
              <Link
                href="/app/perfil"
                aria-label={loading ? t.shell.account : `${name}. ${t.shell.account}`}
                title={loading ? t.shell.account : name}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-fg/[0.055]"
              >
                <Avatar alt="" fallback={name} size="sm" className="size-8" />
              </Link>
            </Tooltip>
          ) : (
            <AccountTrigger
              name={name}
              email={account.email}
              label={`${name}. ${t.shell.account}`}
              open={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            />
          )}
        </div>
      </footer>
    </aside>
  );
}
