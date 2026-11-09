"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { groupSavedChatsByDate, type SavedChatItem } from "@/components/ai/sessions-store";
import { cn } from "@/lib/cn";

/* ───────────────────────────── Iconos (SVG inline) ───────────────────────── */

type IconProps = { className?: string };

function Glyph({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

function SearchGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.3-4.3" />
    </Glyph>
  );
}

function SquarePenGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </Glyph>
  );
}

function MoreHorizontalGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Glyph>
  );
}

function PinGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.1 1.79l-1.79.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
    </Glyph>
  );
}

function PinOffGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </Glyph>
  );
}

function PencilGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.36a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5Z" />
      <path d="m15 5 4 4" />
    </Glyph>
  );
}

function ShareGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </Glyph>
  );
}

function TrashGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Glyph>
  );
}

function CheckGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  );
}

function XGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Glyph>
  );
}

function MessageGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </Glyph>
  );
}

function ChevronRightGlyph({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="m9 18 6-6-6-6" />
    </Glyph>
  );
}

/* ────────────────────────────── Agrupación común ─────────────────────────── */

type ChatSection = {
  key: "pinned" | "today" | "yesterday" | "previous";
  label: string;
  items: SavedChatItem[];
};

/** `groupSavedChatsByDate` ya filtra y ordena; aquí sólo se etiqueta en español. */
function buildSections(chats: readonly SavedChatItem[], query: string): ChatSection[] {
  const grouped = groupSavedChatsByDate(chats, query);
  return [
    { key: "pinned" as const, label: "Fijados", items: grouped.pinned },
    { key: "today" as const, label: "Hoy", items: grouped.today },
    { key: "yesterday" as const, label: "Ayer", items: grouped.yesterday },
    { key: "previous" as const, label: "Anteriores", items: grouped.previous },
  ].filter((section) => section.items.length > 0);
}

function chatExcerpt(chat: SavedChatItem): string {
  const last = chat.messages[chat.messages.length - 1];
  const text = (last ? last.text : "").replace(/\s+/g, " ").trim();
  if (!text) return "Sin mensajes todavía";
  return text.length > 96 ? `${text.slice(0, 96).trimEnd()}…` : text;
}

function chatCountLabel(count: number): string {
  return count === 1 ? "1 conversación" : `${count} conversaciones`;
}

/* ──────────────────────── Buscador de conversaciones ──────────────────────── */

/**
 * Buscador de chats con overlay propio (sin portales). El panel interno sólo
 * se monta cuando `open` es verdadero, así el texto de búsqueda se reinicia
 * al abrir sin `setState` dentro de un efecto.
 */
export function ChatSearchDialog({
  open,
  onOpenChange,
  chats,
  onSelectChat,
  onNewChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: readonly SavedChatItem[];
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}): ReactElement | null {
  if (!open) return null;
  return (
    <ChatSearchPanel
      chats={chats}
      onOpenChange={onOpenChange}
      onSelectChat={onSelectChat}
      onNewChat={onNewChat}
    />
  );
}

function ChatSearchPanel({
  chats,
  onOpenChange,
  onSelectChat,
  onNewChat,
}: {
  chats: readonly SavedChatItem[];
  onOpenChange: (open: boolean) => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const sections = buildSections(chats, query);

  function handleBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onOpenChange(false);
  }

  function handleSelect(chatId: string) {
    onSelectChat(chatId);
    onOpenChange(false);
  }

  function handleNewChat() {
    onNewChat();
    onOpenChange(false);
  }

  return (
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-fg/35 px-4 pb-10 pt-0 backdrop-blur-sm"
      onMouseDown={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto mt-[12vh] w-[min(92vw,32rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-float"
      >
        <h2 id={titleId} className="sr-only">
          Buscar en chats
        </h2>

        <div className="flex items-center gap-2 border-b border-border/70 px-3">
          <SearchGlyph className="size-4 shrink-0 text-fg-muted" />
          <label htmlFor={inputId} className="sr-only">
            Buscar en chats
          </label>
          <input
            id={inputId}
            type="text"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en chats"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            title="Cerrar"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
          >
            <XGlyph className="size-4" />
          </button>
        </div>

        <div className="max-h-[min(52vh,22rem)] overflow-y-auto p-2">
          {sections.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-fg-muted">Sin conversaciones</p>
          ) : (
            sections.map((section) => (
              <section key={section.key} aria-label={section.label} className="mb-1.5 min-w-0 last:mb-0">
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                  {section.label}
                </p>
                <ul className="flex min-w-0 flex-col gap-0.5">
                  {section.items.map((chat) => (
                    <li key={chat.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => handleSelect(chat.id)}
                        className="group flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
                      >
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-1 text-fg-muted transition-colors group-hover:bg-white group-hover:text-fg">
                          <MessageGlyph className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-fg">{chat.title}</span>
                            {chat.pinned ? <PinGlyph className="size-3 shrink-0 text-fg-muted" /> : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                            {chatExcerpt(chat)}
                          </span>
                        </span>
                        <ChevronRightGlyph className="mt-1 size-3.5 shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
          <span className="text-[11px] text-fg-muted">{chatCountLabel(chats.length)}</span>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 text-xs font-semibold text-bg transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:outline-none"
          >
            <SquarePenGlyph className="size-3.5" />
            <span>Nuevo chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Historial del sidebar ────────────────────────── */

const ROW_BUTTON =
  "flex min-w-0 flex-1 items-center truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] leading-5 outline-none transition-colors focus-visible:ring-4 focus-visible:ring-fg/20";

const ICON_BUTTON =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20";

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-fg-body outline-none transition-colors hover:bg-surface-1 hover:text-fg focus-visible:bg-surface-1";

/** Lista compacta de conversaciones para el sidebar del asistente. */
export function NavChatsHistory({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onTogglePinChat,
  onDeleteChat,
  onShareChat,
}: {
  chats: readonly SavedChatItem[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onTogglePinChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onShareChat?: (chatId: string) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Menú abierto: cierra al hacer click fuera o con Escape.
  useEffect(() => {
    if (openMenuId === null) return;
    function handlePointerDown(event: PointerEvent) {
      const node = menuRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      setOpenMenuId(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  const sections = buildSections(chats, query);

  function startRename(chat: SavedChatItem) {
    setRenamingId(chat.id);
    setRenameDraft(chat.title);
    setOpenMenuId(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft("");
  }

  function commitRename() {
    if (renamingId === null) return;
    const title = renameDraft.trim();
    if (!title) return;
    onRenameChat(renamingId, title);
    setRenamingId(null);
    setRenameDraft("");
  }

  return (
    <nav aria-label="Conversaciones" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <SearchGlyph className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar en chats"
            className="h-8 w-full rounded-lg border border-border/70 bg-white pl-7 pr-2 text-[12.5px] text-fg outline-none placeholder:text-fg-muted focus-visible:border-fg/25 focus-visible:ring-4 focus-visible:ring-fg/20"
          />
        </div>
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Nuevo chat"
          title="Nuevo chat"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border/70 bg-white px-2 text-[12px] font-medium text-fg-body outline-none transition hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
        >
          <SquarePenGlyph className="size-3.5" />
          <span>Nuevo</span>
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {sections.length === 0 ? (
          <p className="px-2 py-3 text-[11.5px] text-fg-muted">Sin conversaciones</p>
        ) : (
          sections.map((section) => (
            <section key={section.key} aria-label={section.label} className="min-w-0">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                {section.label}
              </p>
              <ul className="flex min-w-0 flex-col gap-0.5">
                {section.items.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const isMenuOpen = openMenuId === chat.id;
                  const isRenaming = renamingId === chat.id;

                  return (
                    <li key={chat.id} className="min-w-0">
                      <div
                        ref={isMenuOpen ? menuRef : null}
                        className="group/chat relative flex min-w-0 items-center gap-1"
                      >
                        {isRenaming ? (
                          <form
                            className="flex min-w-0 flex-1 items-center gap-1"
                            onSubmit={(event) => {
                              event.preventDefault();
                              commitRename();
                            }}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={renameDraft}
                              onChange={(event) => setRenameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key !== "Escape") return;
                                event.preventDefault();
                                cancelRename();
                              }}
                              aria-label={`Renombrar ${chat.title}`}
                              className="h-7 min-w-0 flex-1 rounded-md border border-border-strong bg-white px-2 text-[12.5px] text-fg outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
                            />
                            <button
                              type="submit"
                              aria-label="Guardar título"
                              title="Guardar título"
                              className={ICON_BUTTON}
                            >
                              <CheckGlyph className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              aria-label="Cancelar renombrado"
                              title="Cancelar"
                              className={ICON_BUTTON}
                            >
                              <XGlyph className="size-3.5" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelectChat(chat.id)}
                              title={chat.title}
                              className={cn(
                                ROW_BUTTON,
                                isActive
                                  ? "bg-surface-1 font-medium text-fg"
                                  : "text-fg-body hover:bg-surface-1 hover:text-fg",
                              )}
                            >
                              <span className="truncate">{chat.title}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(isMenuOpen ? null : chat.id)}
                              aria-label={`Opciones de ${chat.title}`}
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              title={`Opciones de ${chat.title}`}
                              className={cn(
                                ICON_BUTTON,
                                "opacity-0 transition-opacity group-hover/chat:opacity-100 group-focus-within/chat:opacity-100 focus-visible:opacity-100 max-sm:opacity-100",
                              )}
                            >
                              <MoreHorizontalGlyph className="size-3.5" />
                            </button>
                          </>
                        )}

                        {isMenuOpen ? (
                          <div
                            role="menu"
                            aria-label={`Opciones de ${chat.title}`}
                            className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-white p-1 shadow-float"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onTogglePinChat(chat.id);
                                setOpenMenuId(null);
                              }}
                              className={MENU_ITEM}
                            >
                              {chat.pinned ? (
                                <PinOffGlyph className="size-3.5 text-fg-muted" />
                              ) : (
                                <PinGlyph className="size-3.5 text-fg-muted" />
                              )}
                              <span>{chat.pinned ? "Desanclar" : "Fijar"}</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => startRename(chat)}
                              className={MENU_ITEM}
                            >
                              <PencilGlyph className="size-3.5 text-fg-muted" />
                              <span>Renombrar</span>
                            </button>
                            {onShareChat ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onShareChat(chat.id);
                                  setOpenMenuId(null);
                                }}
                                className={MENU_ITEM}
                              >
                                <ShareGlyph className="size-3.5 text-fg-muted" />
                                <span>Compartir</span>
                              </button>
                            ) : null}
                            <div role="separator" className="my-1 h-px bg-border/70" />
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onDeleteChat(chat.id);
                                setOpenMenuId(null);
                              }}
                              className={cn(MENU_ITEM, "text-down hover:bg-down-bg hover:text-down")}
                            >
                              <TrashGlyph className="size-3.5" />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </nav>
  );
}
