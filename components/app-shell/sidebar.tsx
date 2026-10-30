"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandFavicon } from "@/components/app-shell/brand-image";
import { usePathname } from "next/navigation";

import { useAccountLabel } from "@/components/app-shell/account-label";
import { openCommandPalette } from "@/components/app-shell/command-palette";
import { CurrencySwitch } from "@/components/app-shell/currency-switch";
import { isShellSectionActive, shellNav } from "@/components/app-shell/nav";
import { StockSearchButton } from "@/components/app-shell/stock-search";
import { BalanceHeader } from "@/components/domain/balance-header";
import { Avatar } from "@/components/ui/avatar";
import { IconChevron } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { AccountSwitch } from "@/components/app-shell/account-switch";
import { site } from "@/config/site";
import { shouldIgnoreSidebarShortcut, shouldToggleSidebarClick } from "@/lib/app-shell/sidebar";
import type { AccountMode } from "@/lib/account/mode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

const WIDTH_ANIMATION = "transition-[width] duration-200 ease-spring";
const AI_STORAGE_KEY = "mv_ai_chat_v1";

function dispatchAiCommand(
  detail:
    | { type: "clear" }
    | { type: "attach" }
    | { type: "prompt"; id: "tesla" | "compare" | "portfolio" | "photo"; text: string },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mv-ai-command", { detail }));
}

function readRecentUserPrompts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(AI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const prompts: string[] = [];
    const seen = new Set<string>();
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      const item = parsed[i] as { role?: unknown; text?: unknown } | null;
      if (!item || item.role !== "user" || typeof item.text !== "string") continue;
      const clean = item.text.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      prompts.push(clean);
      if (prompts.length >= 5) break;
    }
    return prompts;
  } catch {
    return [];
  }
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

function TrendSparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="m2.5 11 3.5-3.5 2.5 2.5 5-5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 4.5h3v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CompareArrowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M3 5.5h10m0 0L10.5 3M13 5.5 10.5 8M13 10.5H3m0 0L5.5 8M3 10.5 5.5 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PiePortfolioIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M8 2.5v5.5h5.5A5.5 5.5 0 1 1 8 2.5Z" strokeLinejoin="round" />
      <path d="M10 2.2A5.5 5.5 0 0 1 13.8 6H10V2.2Z" strokeLinejoin="round" />
    </svg>
  );
}

function CameraCaptureIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h1.3l.9-1.2h3.6L10.7 4H12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-6Z" strokeLinejoin="round" />
      <circle cx="8" cy="8.5" r="2" />
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

const AI_QUICK_TOOLS = [
  {
    key: "tesla",
    label: "Analizar acción hoy",
    icon: TrendSparkIcon,
    run: () => dispatchAiCommand({ type: "prompt", id: "tesla", text: "¿Cómo va Tesla hoy?" }),
  },
  {
    key: "compare",
    label: "Comparar acciones",
    icon: CompareArrowsIcon,
    run: () => dispatchAiCommand({ type: "prompt", id: "compare", text: "Compara Apple y Microsoft" }),
  },
  {
    key: "portfolio",
    label: "Analizar mi cartera",
    icon: PiePortfolioIcon,
    run: () => dispatchAiCommand({ type: "prompt", id: "portfolio", text: "¿Cómo va mi cartera?" }),
  },
  {
    key: "photo",
    label: "Importar captura",
    icon: CameraCaptureIcon,
    run: () => dispatchAiCommand({ type: "attach" }),
  },
] as const;

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
  const { t } = useT();
  const account = useAccountLabel();
  const name = account.name;
  const loading = account.loading;
  /** Menú del perfil: Perfil, Ajustes, moneda y salir. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);

  useEffect(() => {
    if (!isAiRoute) return;
    const sync = () => setRecentPrompts(readRecentUserPrompts());
    sync();
    window.addEventListener("mv-ai-chat", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mv-ai-chat", sync);
      window.removeEventListener("storage", sync);
    };
  }, [isAiRoute]);

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
        collapsed ? "w-[72px] cursor-e-resize" : isAiRoute ? "w-[244px] cursor-w-resize" : "w-[220px] cursor-w-resize",
      )}
    >
      {isAiRoute ? (
        <>
          <div className={cn("flex items-center gap-2 py-3", collapsed ? "justify-center px-0" : "justify-between px-3")}>
            {collapsed ? (
              <Tooltip content="Volver a Mercado" side="right">
                <Link
                  href="/app"
                  aria-label="Volver a Mercado"
                  className="mx-auto flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border/70 bg-white/85 text-fg shadow-2xs outline-none transition hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <ArrowLeftIcon className="size-4" />
                </Link>
              </Tooltip>
            ) : (
              <>
                <Link
                  href="/app"
                  className="group flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-white/85 px-3 py-1.5 text-xs font-semibold text-fg shadow-2xs outline-none transition hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <ArrowLeftIcon className="size-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
                  <span className="truncate">Volver a Mercado</span>
                </Link>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Alternar barra lateral"
                  title="Alternar barra lateral (⌘B)"
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted outline-none transition hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <SidebarPanelIcon className="size-4" />
                </button>
              </>
            )}
          </div>

          <nav aria-label={t.nav.label} className={cn("flex-1 overflow-y-auto", collapsed ? "px-3.5" : "px-2.5")}>
            <ul className="flex flex-col gap-1">
              <li>
                <StockSearchButton collapsed={collapsed} />
              </li>
              <li>
                {collapsed ? (
                  <Tooltip content="Nuevo chat" side="right">
                    <button
                      type="button"
                      aria-label="Nuevo chat"
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
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl bg-fg px-1 text-sm font-medium text-bg shadow-xs outline-none transition hover:bg-fg/90 focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <ComposeChatIcon className="size-4" />
                    </span>
                    <span className="truncate">Nuevo chat</span>
                  </button>
                )}
              </li>

              {AI_QUICK_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const btn = (
                  <button
                    type="button"
                    aria-label={collapsed ? tool.label : undefined}
                    onClick={tool.run}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center rounded-xl text-left text-sm text-fg-body outline-none transition duration-200 ease-spring hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
                      collapsed ? "mx-auto size-11 justify-center gap-0 px-0" : "w-full gap-2.5 px-1",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center">
                      <Icon className="size-4" />
                    </span>
                    <span
                      className={cn(
                        "overflow-hidden whitespace-nowrap transition-all duration-200 ease-spring",
                        collapsed ? "sr-only" : "truncate text-[13px]",
                      )}
                    >
                      {tool.label}
                    </span>
                  </button>
                );
                return (
                  <li key={tool.key}>
                    {collapsed ? (
                      <Tooltip content={tool.label} side="right">
                        {btn}
                      </Tooltip>
                    ) : (
                      btn
                    )}
                  </li>
                );
              })}
            </ul>

            {!collapsed ? (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
                  Recientes en esta sesión
                </p>
                {recentPrompts.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {recentPrompts.map((promptText) => (
                      <li key={promptText}>
                        <button
                          type="button"
                          onClick={() => dispatchAiCommand({ type: "prompt", id: "tesla", text: promptText })}
                          className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs text-fg-muted outline-none transition hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                        >
                          <HistoryChatIcon className="size-3.5 shrink-0 text-fg-muted" />
                          <span className="truncate">{promptText}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className=" mx-1 rounded-xl border border-border/60 bg-white/55 px-3 py-2.5 text-xs text-fg-muted">
                    Tus consultas de hoy aparecerán aquí.
                  </div>
                )}
              </div>
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
