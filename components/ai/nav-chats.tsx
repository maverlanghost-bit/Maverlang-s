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

function Search({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.3-4.3" />
    </Glyph>
  );
}

function SquarePen({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </Glyph>
  );
}

function MoreHorizontal({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Glyph>
  );
}

function Pin({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.1 1.79l-1.79.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
    </Glyph>
  );
}

function PinOff({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </Glyph>
  );
}

function Pencil({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.36a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5Z" />
      <path d="m15 5 4 4" />
    </Glyph>
  );
}

function Share({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </Glyph>
  );
}

function Trash({ className }: IconProps) {
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

function Check({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  );
}

function X({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Glyph>
  );
}

function MessageSquare({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </Glyph>
  );
}

function ChevronRight({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="m9 18 6-6-6-6" />
    </Glyph>
  );
}

function Clock({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Glyph>
  );
}

function ArrowRight({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
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

/**
 * Fecha estable para SSR y cliente: se piden sólo partes numéricas en una zona
 * horaria fija y el mes se traduce con una tabla propia, así el HTML del
 * servidor y el del navegador coinciden aunque el host use otra zona o ICU.
 */
const chatMomentFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});

const SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function formatChatMoment(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const parts = chatMomentFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  const month = Number(part("month"));
  const monthLabel = SHORT_MONTHS[month - 1] ?? "";
  return `${part("day")} ${monthLabel} · ${part("hour")}:${part("minute")}`;
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Foco inicial en el campo de búsqueda al abrir el modal.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

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
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/40 px-4 pb-10 pt-[12vh] backdrop-blur-sm"
      onMouseDown={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      >
        <h2 id={titleId} className="sr-only">
          Buscar en chats
        </h2>

        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 transition-colors focus-within:border-zinc-300">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <label htmlFor={inputId} className="sr-only">
            Buscar en chats
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            autoFocus
            data-bare-input=""
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en chats"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            title="Cerrar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[min(56vh,24rem)] overflow-y-auto p-2">
          {sections.length === 0 ? (
            <p className="px-3 py-10 text-center text-xs text-zinc-400">Sin conversaciones</p>
          ) : (
            sections.map((section) => (
              <section
                key={section.key}
                aria-label={section.label}
                className="mb-1.5 min-w-0 last:mb-0"
              >
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {section.label}
                </p>
                <ul className="flex min-w-0 flex-col gap-0.5">
                  {section.items.map((chat) => (
                    <li key={chat.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => handleSelect(chat.id)}
                        className="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none"
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-zinc-900">
                            {chat.title}
                          </span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-zinc-400">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="shrink-0">{formatChatMoment(chat.updatedAt)}</span>
                            <span className="truncate">· {chatExcerpt(chat)}</span>
                          </span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2">
          <span className="text-[11px] text-zinc-400">{chatCountLabel(chats.length)}</span>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            <SquarePen className="h-3.5 w-3.5" />
            <span>Nuevo chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Historial del sidebar ────────────────────────── */

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-zinc-700 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:bg-zinc-100";

const MENU_ICON = "h-3.5 w-3.5 shrink-0 text-zinc-400";

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
  const [isOpen, setIsOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const contentId = useId();
  const searchId = useId();

  const hasQuery = query.trim().length > 0;

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

  function toggleSection() {
    const next = !isOpen;
    setIsOpen(next);
    if (!next) setShowSearch(false);
  }

  function toggleSearch() {
    setIsOpen(true);
    setShowSearch((value) => !value);
  }

  return (
    <nav aria-label="Conversaciones" className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-1 px-1 pb-0.5">
        <button
          type="button"
          onClick={toggleSection}
          aria-expanded={isOpen}
          aria-controls={isOpen ? contentId : undefined}
          className="flex min-w-0 items-center gap-1 rounded-md py-1 pr-1.5 text-left outline-none transition-colors hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Chats
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onNewChat}
            aria-label="Nuevo chat"
            title="Nuevo chat"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            <SquarePen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleSearch}
            aria-label="Buscar en chats"
            aria-expanded={showSearch}
            aria-controls={showSearch ? searchId : undefined}
            title="Buscar en chats"
            className={cn(
              "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
              showSearch
                ? "bg-zinc-200/60 text-zinc-700"
                : "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700",
            )}
          >
            <Search className="h-3.5 w-3.5" />
            {hasQuery && !showSearch ? (
              <span
                className="absolute right-1 top-1 h-1 w-1 rounded-full bg-amber-500"
                aria-hidden="true"
              />
            ) : null}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div id={contentId} className="flex min-w-0 flex-col">
          {showSearch ? (
            <div className="px-1 pb-2 pt-0.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  id={searchId}
                  type="text"
                  data-bare-input=""
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar en chats"
                  aria-label="Buscar en chats"
                  className="h-7 w-full rounded-md border border-zinc-200 bg-white pl-7 pr-2 text-xs text-zinc-700 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200"
                />
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-2">
            {sections.length === 0 ? (
              <p className="px-3 py-2 text-[11.5px] text-zinc-400">Sin conversaciones</p>
            ) : (
              sections.map((section) => (
                <section key={section.key} aria-label={section.label} className="min-w-0">
                  {section.key === "pinned" ? (
                    <p className="flex items-center gap-1 px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-amber-500/90">
                      <Pin className="h-2.5 w-2.5 rotate-45" />
                      <span>{section.label}</span>
                    </p>
                  ) : (
                    <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {section.label}
                    </p>
                  )}

                  <ul className="flex min-w-0 flex-col gap-0.5">
                    {section.items.map((chat) => {
                      const isActive = chat.id === activeChatId;
                      const isMenuOpen = openMenuId === chat.id;
                      const isRenaming = renamingId === chat.id;

                      return (
                        <li key={chat.id} className="min-w-0">
                          <div
                            ref={isMenuOpen ? menuRef : null}
                            className="group relative min-w-0"
                          >
                            {isRenaming ? (
                              <form
                                className="flex min-w-0 items-center gap-0.5 px-1 py-0.5"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  commitRename();
                                }}
                              >
                                <input
                                  type="text"
                                  data-bare-input=""
                                  autoFocus
                                  value={renameDraft}
                                  onChange={(event) => setRenameDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key !== "Escape") return;
                                    event.preventDefault();
                                    cancelRename();
                                  }}
                                  aria-label={`Renombrar ${chat.title}`}
                                  className="h-7 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-[12.5px] text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200"
                                />
                                <button
                                  type="submit"
                                  aria-label="Guardar título"
                                  title="Guardar título"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelRename}
                                  aria-label="Cancelar renombrado"
                                  title="Cancelar"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </form>
                            ) : (
                              <div className="flex min-w-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => onSelectChat(chat.id)}
                                  title={chat.title}
                                  className={cn(
                                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-300",
                                    isActive
                                      ? "bg-zinc-200/60 font-medium text-zinc-900"
                                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                                  )}
                                >
                                  {chat.pinned ? (
                                    <Pin className="h-3.5 w-3.5 shrink-0 fill-amber-500/20 text-amber-500" />
                                  ) : (
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                  )}
                                  <span className="truncate text-[13px] leading-5">
                                    {chat.title}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOpenMenuId(isMenuOpen ? null : chat.id)}
                                  aria-label={`Opciones de ${chat.title}`}
                                  aria-haspopup="menu"
                                  aria-expanded={isMenuOpen}
                                  title={`Opciones de ${chat.title}`}
                                  className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 max-sm:opacity-100",
                                    isMenuOpen
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                                  )}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </div>
                            )}

                            {isMenuOpen ? (
                              <div
                                role="menu"
                                aria-label={`Opciones de ${chat.title}`}
                                className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-zinc-200/80 bg-white p-1 shadow-lg"
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
                                    <PinOff className={MENU_ICON} />
                                  ) : (
                                    <Pin className={MENU_ICON} />
                                  )}
                                  <span>{chat.pinned ? "Desanclar" : "Fijar"}</span>
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => startRename(chat)}
                                  className={MENU_ITEM}
                                >
                                  <Pencil className={MENU_ICON} />
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
                                    <Share className={MENU_ICON} />
                                    <span>Compartir</span>
                                  </button>
                                ) : null}
                                <div role="separator" className="my-1 h-px bg-zinc-200/70" />
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    onDeleteChat(chat.id);
                                    setOpenMenuId(null);
                                  }}
                                  className={cn(
                                    MENU_ITEM,
                                    "text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:bg-red-50",
                                  )}
                                >
                                  <Trash className="h-3.5 w-3.5 shrink-0" />
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
        </div>
      ) : null}
    </nav>
  );
}
