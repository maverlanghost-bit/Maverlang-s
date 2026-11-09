"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

/** Cuánto dura el feedback "¡Copiado!" dentro del menú. */
const COPIED_FEEDBACK_MS = 1500;

/**
 * Círculo del cluster flotante. El anillo blanco separa un círculo del
 * siguiente cuando se superponen con `-ml-2`.
 */
const CLUSTER_CIRCLE = cn(
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm ring-2 ring-white",
  "transition hover:z-10 hover:-translate-y-px focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:outline-none",
  "disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none",
);

export type AssistantNavbarProps = {
  chatTitle: string;
  hasMessages: boolean;
  isPinned?: boolean;
  selectedModel?: "fast" | "pro";
  onSelectModel?: (model: "fast" | "pro") => void;
  /** Cuántos elementos de contexto hay adjuntos (badge `+N`). */
  contextCount?: number;
  /** Abre el selector de contexto desde el círculo «+». */
  onOpenContext?: () => void;
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
 * Acciones del asistente como cluster flotante de 3 círculos sobrepuestos
 * (nuevo chat, agregar contexto y más opciones). No renderiza barra superior,
 * título ni selector de modelo: eso vive en el compositor.
 *
 * Todo el estado es local y sólo se activa con interacción del usuario: en SSR
 * se renderizan los 3 círculos, sin menú abierto.
 */
export function AssistantNavbar({
  chatTitle,
  hasMessages,
  isPinned = false,
  contextCount = 0,
  onOpenContext,
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
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
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
    if (!menuOpen || !editingTitle) return;
    const frame = requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [menuOpen, editingTitle]);

  // Cierre del menú con click fuera y Escape; sólo se suscribe mientras está abierto.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const container = menuRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      setMenuOpen(false);
      setEditingTitle(false);
      setDraftTitle("");
      setCopied(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();

      // Con el renombrado abierto, el primer Escape sólo cancela la edición.
      if (editingTitle) {
        setEditingTitle(false);
        setDraftTitle("");
        menuPanelRef.current?.focus();
        return;
      }

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
  }, [menuOpen, editingTitle]);

  const clearCopiedFeedback = () => {
    setCopied(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setEditingTitle(false);
    setDraftTitle("");
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

  const startEditingTitle = () => {
    if (!onRenameChat) return;
    setDraftTitle(title);
    setEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setEditingTitle(false);
    setDraftTitle("");
    menuPanelRef.current?.focus();
  };

  const commitTitle = () => {
    const next = draftTitle.trim();
    if (next.length > 0 && next !== title) onRenameChat?.(next);
    closeMenu();
    menuButtonRef.current?.focus();
  };

  const handleTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitTitle();
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
    <>
      {leading ? <div className="absolute left-3 top-3 z-30 flex items-center">{leading}</div> : null}

      <div className={cn("absolute right-3 top-3 z-30 flex items-center pl-2", className)}>
        <button
          type="button"
          title="Nuevo chat"
          aria-label="Nuevo chat"
          onClick={onNewChat}
          disabled={!onNewChat}
          className={CLUSTER_CIRCLE}
        >
          <IconSquarePen />
        </button>

        <button
          type="button"
          title="Agregar contexto"
          aria-label="Agregar contexto"
          onClick={onOpenContext}
          disabled={!onOpenContext}
          className={cn(CLUSTER_CIRCLE, "-ml-2")}
        >
          <IconPlus />

          {contextCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold leading-none text-white"
            >
              +{contextCount}
            </span>
          ) : null}
        </button>

        <div ref={menuRef} className="relative -ml-2">
          <button
            ref={menuButtonRef}
            type="button"
            title="Más opciones del chat"
            aria-label="Más opciones del chat"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            className={cn(CLUSTER_CIRCLE, menuOpen && "bg-zinc-50 text-zinc-900")}
          >
            <IconMoreHorizontal />
          </button>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                ref={menuPanelRef}
                role="menu"
                aria-label="Más opciones del chat"
                tabIndex={-1}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-2xl outline-none"
              >
                {editingTitle ? (
                  <div className="flex items-center gap-1">
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={draftTitle}
                      aria-label="Título de la conversación"
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={handleTitleKeyDown}
                      className="h-9 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-2.5 text-[13px] font-semibold text-zinc-900 outline-none transition focus-visible:ring-2 focus-visible:ring-zinc-300 motion-reduce:transition-none"
                    />
                    <button
                      type="button"
                      title="Guardar título"
                      aria-label="Guardar título"
                      onClick={commitTitle}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-green-600 outline-none transition hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-green-200 motion-reduce:transition-none"
                    >
                      <IconCheck />
                    </button>
                    <button
                      type="button"
                      title="Cancelar"
                      aria-label="Cancelar"
                      onClick={cancelEditingTitle}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-300 motion-reduce:transition-none"
                    >
                      <IconX />
                    </button>
                  </div>
                ) : (
                  <>
                    <MenuItem
                      icon={<IconSearch />}
                      label="Buscar en chats"
                      title="Buscar en chats"
                      ariaLabel="Buscar en chats"
                      onClick={() => runAndClose(onOpenSearch)}
                      disabled={!onOpenSearch}
                    />

                    <div role="separator" className="my-1 h-px bg-zinc-100" />

                    {/* Renombrar y fijar no dependen de que haya mensajes: el
                        prompt sólo manda ocultar compartir/copiar/exportar/eliminar. */}
                    <MenuItem
                      icon={<IconPencil />}
                      label="Renombrar chat"
                      onClick={startEditingTitle}
                      disabled={!onRenameChat}
                    />

                    <MenuItem
                      icon={isPinned ? <IconPinOff /> : <IconPin />}
                      label={isPinned ? "Desfijar de favoritos" : "Fijar en favoritos"}
                      onClick={() => runAndClose(onTogglePin)}
                    />

                    {hasMessages ? (
                      <>
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
                      </>
                    ) : null}
                  </>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone = "default",
  title,
  ariaLabel,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const danger = tone === "danger";
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left text-[13px] rounded-lg px-2.5 py-2 flex items-center gap-2 font-medium outline-none",
        "transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-zinc-300",
        "disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent",
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

function IconPlus({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
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
