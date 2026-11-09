"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { ModelSelector } from "@/components/ai/model-selector";
import { cn } from "@/lib/cn";

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

  const hasUpperMenuItems = Boolean(
    onRenameChat || onTogglePin || onShareChat || onCopyAllText || onExportMarkdown,
  );
  const hasMenuItems = hasUpperMenuItems || Boolean(onDeleteChat);

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
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
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

  const closeMenu = () => {
    setMenuOpen(false);
    setCopied(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
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
    }, 2000);
  };

  return (
    <div
      className={cn(
        "relative flex h-[3.25rem] shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-bg/85 px-3 backdrop-blur-md sm:px-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}

        {editingTitle ? (
          <div className="flex min-w-0 items-center gap-1">
            <input
              ref={titleInputRef}
              type="text"
              value={draftTitle}
              aria-label="Título de la conversación"
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="h-8 w-36 min-w-0 rounded-lg border border-border-strong bg-white px-2.5 text-sm font-medium text-fg outline-none focus-visible:ring-4 focus-visible:ring-fg/20 sm:w-64"
            />
            <button
              type="button"
              aria-label="Guardar título"
              title="Guardar título"
              onClick={commitTitle}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
            >
              <IconCheck className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              title="Cancelar"
              onClick={cancelEditingTitle}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
            >
              <IconX className="size-4" />
            </button>
          </div>
        ) : onRenameChat ? (
          <button
            type="button"
            onClick={startEditingTitle}
            title="Renombrar chat"
            className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left outline-none transition-colors hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
          >
            <span className="truncate text-sm font-medium tracking-tight text-fg">{title}</span>
            <IconPencil className="size-3.5 shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
          </button>
        ) : (
          <span className="min-w-0 truncate px-1.5 text-sm font-medium tracking-tight text-fg">
            {title}
          </span>
        )}

        <ModelSelector
          variant="header"
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          className="ml-0.5"
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <BarButton label="Buscar en chats" onClick={onOpenSearch}>
          <IconSearch />
        </BarButton>

        <BarButton label="Nuevo chat" onClick={onNewChat}>
          <IconSquarePen />
        </BarButton>

        {hasMessages ? (
          <BarButton label="Compartir conversación" onClick={onShareChat}>
            <IconShare />
          </BarButton>
        ) : null}

        {hasMessages && hasMenuItems ? (
          <div ref={menuRef} className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Más opciones del chat"
              title="Más opciones del chat"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none",
                "transition-colors duration-150 hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
                "focus-visible:ring-4 focus-visible:ring-fg/20",
                menuOpen && "bg-surface-1 text-fg",
              )}
            >
              <IconMoreHorizontal />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Más opciones del chat"
                className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-2xl border border-border bg-white p-1.5 shadow-[0_18px_40px_-24px_rgba(12,15,20,0.35)]"
              >
                {onRenameChat ? (
                  <MenuItem
                    icon={<IconPencil />}
                    label="Renombrar chat"
                    onClick={() => {
                      closeMenu();
                      startEditingTitle();
                    }}
                  />
                ) : null}

                {onTogglePin ? (
                  <MenuItem
                    icon={isPinned ? <IconPinOff /> : <IconPin />}
                    label={isPinned ? "Desfijar de favoritos" : "Fijar en favoritos"}
                    onClick={() => runAndClose(onTogglePin)}
                  />
                ) : null}

                {onShareChat ? (
                  <MenuItem
                    icon={<IconShare />}
                    label="Compartir conversación"
                    onClick={() => runAndClose(onShareChat)}
                  />
                ) : null}

                {onCopyAllText ? (
                  <MenuItem icon={<IconCopy />} label={copied ? "¡Copiado!" : "Copiar texto completo"} onClick={handleCopyAll} />
                ) : null}

                {onExportMarkdown ? (
                  <MenuItem
                    icon={<IconDownload />}
                    label="Exportar a Markdown (.md)"
                    onClick={() => runAndClose(onExportMarkdown)}
                  />
                ) : null}

                {hasUpperMenuItems && onDeleteChat ? (
                  <div role="separator" className="my-1 h-px bg-border/70" />
                ) : null}

                {onDeleteChat ? (
                  <MenuItem
                    icon={<IconTrash />}
                    label="Eliminar conversación"
                    tone="danger"
                    onClick={() => runAndClose(onDeleteChat)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none",
        "transition-colors duration-150 hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
        "focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted",
      )}
    >
      {children}
    </button>
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
        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium outline-none",
        "transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-4 focus-visible:ring-fg/20",
        danger ? "text-down hover:bg-down-bg" : "text-fg-body hover:bg-surface-1 hover:text-fg",
      )}
    >
      <span className={cn("shrink-0", danger ? "text-down" : "text-fg-muted")}>{icon}</span>
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
