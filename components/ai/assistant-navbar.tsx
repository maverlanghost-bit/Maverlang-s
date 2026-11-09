"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { ModelSelector } from "@/components/ai/model-selector";
import { cn } from "@/lib/cn";

/** Cuánto dura el feedback "¡Copiado!" dentro del menú. */
const COPIED_FEEDBACK_MS = 1500;

export type AssistantNavbarProps = {
  chatTitle: string;
  hasMessages: boolean;
  isPinned?: boolean;
  selectedModel?: "fast" | "pro";
  onSelectModel?: (model: "fast" | "pro") => void;
  onRenameChat?: (newTitle: string) => void;
  onTogglePin?: () => void;
  onNewChat?: () => void;
  onShareChat?: () => void;
  onCopyAllText?: () => void;
  onExportMarkdown?: () => void;
  onDeleteChat?: () => void;
  onOpenSearch?: () => void;
  leading?: ReactNode;
  className?: string;
};

/**
 * Barra superior del asistente: título editable en línea, selector de modelo y
 * acciones de sesión (buscar, nuevo chat, compartir y menú de 3 puntos).
 *
 * Todo el estado es local y sólo se activa con interacción del usuario: en SSR
 * se renderiza el título, la píldora de modelo y los botones, sin menús abiertos.
 */
export function AssistantNavbar({
  chatTitle,
  hasMessages,
  isPinned = false,
  selectedModel,
  onSelectModel,
  onRenameChat,
  onTogglePin,
  onNewChat,
  onShareChat,
  onCopyAllText,
  onExportMarkdown,
  onDeleteChat,
  onOpenSearch,
  leading,
  className,
}: AssistantNavbarProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title = chatTitle.trim().length > 0 ? chatTitle.trim() : "Nueva conversación";

  // Sólo limpia el temporizador de "¡Copiado!": ningún setState dentro del efecto.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Foco del input de título tras montarlo (rAF para no bloquear el paint).
  useEffect(() => {
    if (!editingTitle) return;
    const frame = requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingTitle]);

  // Cierre del menú con click fuera y Escape; sólo se suscribe mientras está abierto.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const container = menuRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      setMenuOpen(false);
      setCopied(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setCopied(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const startEditingTitle = () => {
    if (!onRenameChat) return;
    setDraftTitle(title);
    setEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setEditingTitle(false);
    setDraftTitle("");
  };

  const commitTitle = () => {
    const next = draftTitle.trim();
    if (next.length > 0 && next !== title) onRenameChat?.(next);
    setEditingTitle(false);
    setDraftTitle("");
  };

  const handleTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitle();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingTitle();
    }
  };

  const clearCopiedFeedback = () => {
    setCopied(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
    clearCopiedFeedback();
  };

  const openMenu = () => {
    clearCopiedFeedback();
    setMenuOpen(true);
  };

  const runAndClose = (action?: () => void) => {
    action?.();
    closeMenu();
  };

  // La confirmación "¡Copiado!" vive dentro del menú: no lo cerramos al copiar.
  const handleCopyAll = () => {
    onCopyAllText?.();
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, COPIED_FEEDBACK_MS);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full h-14 sm:h-15 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md flex items-center justify-between px-3 sm:px-5 gap-2 transition-colors duration-200 select-none",
        className,
      )}
    >
      {/* ── Izquierda: leading, título editable y selector de modelo ── */}
      <div className="flex items-center gap-2 min-w-0 max-w-[60%] sm:max-w-[70%]">
        {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}

        <div className="w-px h-5 bg-zinc-200 shrink-0 hidden sm:block" />

        <div className="flex items-center gap-1.5 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={draftTitle}
                aria-label="Título de la conversación"
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={handleTitleKeyDown}
                className="h-8 px-2.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold outline-none w-40 sm:w-64 min-w-0 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
              <button
                type="button"
                aria-label="Guardar título"
                title="Guardar título"
                onClick={commitTitle}
                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 outline-none transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-green-200 motion-reduce:transition-none"
              >
                <IconCheck className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Cancelar"
                title="Cancelar"
                onClick={cancelEditingTitle}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 outline-none transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-zinc-300 motion-reduce:transition-none"
              >
                <IconX className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditingTitle}
              disabled={!onRenameChat}
              title={onRenameChat ? "Renombrar chat" : undefined}
              className="group flex items-center gap-1.5 min-w-0 rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-default motion-reduce:transition-none"
            >
              <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate tracking-tight">{title}</span>
              <IconPencil className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 motion-reduce:transition-none" />
            </button>
          )}
        </div>

        <ModelSelector variant="header" selectedModel={selectedModel} onSelectModel={onSelectModel} className="ml-0.5 hidden shrink-0 sm:flex" />
      </div>

      {/* ── Derecha: buscar, nuevo chat, compartir y menú de 3 puntos ── */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          type="button"
          title="Buscar en chats"
          aria-label="Buscar en chats"
          onClick={onOpenSearch}
          disabled={!onOpenSearch}
          className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 outline-none transition-colors duration-150 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none"
        >
          <IconSearch className="size-4.5" />
        </button>

        <button
          type="button"
          title="Nuevo chat"
          aria-label="Nuevo chat"
          onClick={onNewChat}
          disabled={!onNewChat}
          className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 outline-none transition-colors duration-150 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none"
        >
          <IconSquarePen className="size-4.5" />
        </button>

        {hasMessages ? (
          <button
            type="button"
            title="Compartir conversación"
            aria-label="Compartir conversación"
            onClick={onShareChat}
            disabled={!onShareChat}
            className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 outline-none transition-colors duration-150 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none"
          >
            <IconShare className="size-4.5" />
          </button>
        ) : null}

        {hasMessages ? (
          <div ref={menuRef} className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Más opciones del chat"
              title="Más opciones del chat"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => (menuOpen ? closeMenu() : openMenu())}
              className={cn(
                "inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-xl text-zinc-700 outline-none",
                "transition-colors duration-150 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-300 motion-reduce:transition-none",
                menuOpen && "bg-zinc-100 text-zinc-900",
              )}
            >
              <IconMoreHorizontal className="size-4.5" />
            </button>

            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  role="menu"
                  aria-label="Más opciones del chat"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 top-full z-50 mt-1.5 w-56 origin-top-right rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-2xl"
                >
                  <MenuItem
                    icon={<IconPencil />}
                    label="Renombrar chat"
                    onClick={() => {
                      closeMenu();
                      startEditingTitle();
                    }}
                  />

                  <MenuItem
                    icon={isPinned ? <IconPinOff /> : <IconPin />}
                    label={isPinned ? "Desfijar de favoritos" : "Fijar en favoritos"}
                    onClick={() => runAndClose(onTogglePin)}
                  />

                  <MenuItem
                    icon={<IconShare />}
                    label="Compartir conversación"
                    onClick={() => runAndClose(onShareChat)}
                  />

                  <MenuItem
                    icon={copied ? <IconCheck /> : <IconCopy />}
                    label={copied ? "¡Copiado!" : "Copiar texto completo"}
                    onClick={handleCopyAll}
                  />

                  <MenuItem
                    icon={<IconDownload />}
                    label="Exportar a Markdown (.md)"
                    onClick={() => runAndClose(onExportMarkdown)}
                  />

                  <div role="separator" className="my-1 h-px bg-zinc-100" />

                  <MenuItem
                    icon={<IconTrash />}
                    label="Eliminar conversación"
                    tone="danger"
                    onClick={() => runAndClose(onDeleteChat)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "w-full text-left text-[13px] rounded-lg px-2.5 py-2 flex items-center gap-2 font-medium outline-none",
        "transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-zinc-300",
        danger ? "text-red-600 hover:bg-red-50" : "text-zinc-700 hover:bg-zinc-100",
      )}
    >
      <span className={cn("shrink-0", danger ? "text-red-500" : "text-zinc-400")}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function IconFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <circle cx="7" cy="7" r="4.1" />
      <path d="m10.2 10.2 3.1 3.1" />
    </IconFrame>
  );
}

function IconSquarePen({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M8.6 3H4.9A1.9 1.9 0 0 0 3 4.9v6.2A1.9 1.9 0 0 0 4.9 13h6.2a1.9 1.9 0 0 0 1.9-1.9V7.4" />
      <path d="M11.6 2.5a1.32 1.32 0 0 1 1.9 1.9L8.4 9.5l-2.3.4.4-2.3 5.1-5.1Z" />
    </IconFrame>
  );
}

function IconShare({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <circle cx="12.2" cy="3.6" r="1.6" />
      <circle cx="3.8" cy="8" r="1.6" />
      <circle cx="12.2" cy="12.4" r="1.6" />
      <path d="m5.2 7.2 5.4-2.8M5.2 8.8l5.4 2.8" />
    </IconFrame>
  );
}

function IconMoreHorizontal({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M3.3 8h.01M8 8h.01M12.7 8h.01" strokeWidth="2.2" />
    </IconFrame>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M11.4 2.4a1.35 1.35 0 0 1 1.9 1.9l-6.4 6.4-2.4.5.5-2.4 6.4-6.4Z" />
    </IconFrame>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="m3.3 8.4 3 3 6.4-6.8" />
    </IconFrame>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </IconFrame>
  );
}

function IconPin({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M6.1 2.6h3.8l-.55 3.05 2 2v1.05H4.65v-1.05l2-2L6.1 2.6Z" />
      <path d="M8 9.1v4.3" />
    </IconFrame>
  );
}

function IconPinOff({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M6.1 2.6h3.8l-.55 3.05 2 2v1.05H4.65v-1.05l2-2L6.1 2.6Z" />
      <path d="M8 9.1v4.3" />
      <path d="m2.4 2.4 11.2 11.2" />
    </IconFrame>
  );
}

function IconCopy({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M10.4 3.6H5A1.9 1.9 0 0 0 3.1 5.5v5.4" />
      <rect x="5.5" y="5.5" width="7.4" height="7.4" rx="1.7" />
    </IconFrame>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M8 2.6v7.1" />
      <path d="m5.2 7.4 2.8 2.8 2.8-2.8" />
      <path d="M3.1 11.5v1.1a1.8 1.8 0 0 0 1.8 1.8h6.2a1.8 1.8 0 0 0 1.8-1.8v-1.1" />
    </IconFrame>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M2.8 4.3h10.4" />
      <path d="M6.3 4.3V3.2a.9.9 0 0 1 .9-.9h1.6a.9.9 0 0 1 .9.9v1.1" />
      <path d="m4.3 4.3.6 8.1a1.4 1.4 0 0 0 1.4 1.3h3.4a1.4 1.4 0 0 0 1.4-1.3l.6-8.1" />
      <path d="M6.7 6.7v4.2M9.3 6.7v4.2" />
    </IconFrame>
  );
}

export default AssistantNavbar;
