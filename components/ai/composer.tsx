"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { isCodeSnippet } from "@/components/ai/code-block";
import { ModelSelector } from "@/components/ai/model-selector";
import {
  applyReasoningPrefix,
  ReasoningModeBar,
  type AiReasoningMode,
} from "@/components/ai/reasoning-mode-bar";
import { IconCheck, IconChevron, IconClose, IconGlobe } from "@/components/ui/icons";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

// Mismo valor que AI_DOCK_SLOT_ID de components/app-shell/nav.ts.
const DOCK_SLOT_ID = "mv-ai-dock-slot";
const MOBILE_QUERY = "(max-width: 1023px)";

/** Anillo de foco compartido por todos los controles del compositor. */
const FOCUS_RING = "outline-none focus-visible:ring-4 focus-visible:ring-fg/20";

/** Nombre legible de cada herramienta avanzada que el chat puede activar. */
const TOOL_LABELS: Record<string, string> = {
  chart_bar: "Gráfico de barras",
  chart_line: "Gráfico de líneas",
  chart_pie: "Gráfico circular",
  chart_area: "Gráfico de área",
  chart_radar: "Gráfico de radar",
  fin_metrics: "Análisis fundamental",
  stock_compare: "Comparar acciones",
  sector_perf: "Rendimiento sectorial",
};

const CHART_TOOLS: readonly string[] = [
  "chart_bar",
  "chart_line",
  "chart_pie",
  "chart_area",
  "chart_radar",
];
const ANALYSIS_TOOLS: readonly string[] = ["fin_metrics", "stock_compare", "sector_perf"];

function toolLabel(id: string): string {
  return TOOL_LABELS[id] ?? id.replace(/_/g, " ");
}

/** Vistas del popover del botón «+». */
type MenuView = "main" | "charts" | "analysis";

/**
 * Tipos mínimos de la Web Speech API: TypeScript no la trae en lib.dom.
 * Se declaran aquí para no usar `any` en ningún punto.
 */
type SpeechAlternative = { transcript: string };
type SpeechResult = { [index: number]: SpeechAlternative };
type SpeechResultList = { length: number; [index: number]: SpeechResult };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speech = window as SpeechWindow;
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

/** Devuelve el contenedor del dock móvil (dentro de la barra inferior) o null. */
function useDockSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const find = () => {
      const el = query.matches ? document.getElementById(DOCK_SLOT_ID) : null;
      setSlot((prev) => (prev === el ? prev : el));
      return el;
    };
    find();
    query.addEventListener("change", find);
    const observer = new MutationObserver(() => {
      if (find()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      query.removeEventListener("change", find);
      observer.disconnect();
    };
  }, []);
  return slot;
}

export function Composer({
  copy,
  draft,
  pendingImage,
  typing,
  photoError,
  suggestions,
  onDraft,
  onSubmit,
  onSuggest,
  onAttach,
  onFile,
  onRemoveImage,
  fileRef,
  selectedModel,
  onSelectModel,
  webSearchEnabled,
  onToggleWebSearch,
  activeTools = [],
  onToggleTool,
  onStop,
  variant = "bottom",
}: {
  copy: AsistenteCopy;
  draft: string;
  pendingImage: string | null;
  typing: boolean;
  photoError: string | null;
  suggestions: boolean;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onSuggest: (id: AsistenteSuggestionId, text: string) => void;
  onAttach: () => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  selectedModel?: "fast" | "pro";
  onSelectModel?: (model: "fast" | "pro") => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  activeTools?: readonly string[];
  onToggleTool?: (toolId: string) => void;
  onStop?: () => void;
  variant?: "landing" | "bottom";
}) {
  const canSend = !typing && (draft.trim().length > 0 || pendingImage != null);
  const showStop = typing && onStop != null;
  const showCount = draft.length > 1200;
  const codePasted = isCodeSnippet(draft);

  const dockSlot = useDockSlot();

  // Modo de razonamiento del compositor (flash por defecto).
  const [mode, setMode] = useState<AiReasoningMode>("flash");

  // La búsqueda web puede venir controlada por el coordinador o vivir aquí.
  const [localWebSearch, setLocalWebSearch] = useState(false);
  const webSearchOn = webSearchEnabled ?? localWebSearch;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("main");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [listening, setListening] = useState(false);
  const [speechReady, setSpeechReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const draftRef = useRef(draft);

  // El dictado necesita el borrador más reciente sin volver a suscribir el reconocedor.
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Detectar la API de voz en el siguiente frame (sin setState síncrono dentro del efecto).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSpeechReady(speechRecognitionCtor() !== null));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Al desmontar, cortar el micrófono sin disparar setState.
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Ya estaba detenido: no hay nada que hacer.
      }
    };
  }, []);

  // Popover de herramientas: cierra con click fuera y con Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => {
      setMenuOpen(false);
      setMenuView("main");
    };
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSubmit();
  }

  function handleModeChange(nextMode: AiReasoningMode) {
    setMode(nextMode);
    if (nextMode === "deep" && draft.trim().length > 0) {
      onDraft(applyReasoningPrefix(draft, "deep"));
    } else if (nextMode === "portfolio" && draft.trim().length === 0) {
      onDraft("Analiza mi cartera: concentración, riesgos y balance");
    }
  }

  function toggleWebSearch() {
    if (onToggleWebSearch) {
      onToggleWebSearch();
      return;
    }
    setLocalWebSearch((prev) => !prev);
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuView("main");
  }

  function toggleMenu() {
    if (menuOpen) {
      closeMenu();
      return;
    }
    setMenuView("main");
    setMenuOpen(true);
  }

  function uploadPhoto() {
    closeMenu();
    fileRef.current?.click();
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition = speechRecognitionCtor();
    if (!Recognition) {
      setSpeechReady(false);
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = "es-CL";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const transcript = last?.[0]?.transcript?.trim() ?? "";
        if (!transcript) return;
        const base = draftRef.current.trimEnd();
        onDraft(base ? `${base} ${transcript}` : transcript);
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }

  const pendingBlock = pendingImage ? (
    <div className="mb-2.5 flex items-center gap-2.5 rounded-2xl border border-border/70 bg-white/85 p-2 pr-2.5">
      {/* La foto es un data URL del usuario: el optimizador de Next no la acepta. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pendingImage}
        alt=""
        className="size-12 shrink-0 rounded-xl border border-border/60 object-cover"
      />
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-fg-body">{copy.photoAlt}</p>
      <button
        type="button"
        onClick={onRemoveImage}
        className={cn(
          "inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-border/70 bg-white px-3 text-xs font-medium text-fg-body transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-[0.98] motion-reduce:transition-none",
          FOCUS_RING,
        )}
      >
        <IconClose />
        {copy.removePhoto}
      </button>
    </div>
  ) : null;

  const errorBlock = photoError ? (
    <p
      id="ai-composer-error"
      role="alert"
      className="mb-2 rounded-xl border border-down/20 bg-down-bg/80 px-3 py-2 text-xs leading-relaxed break-words text-down"
    >
      {photoError}
    </p>
  ) : null;

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png"
      capture="environment"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={onFile}
    />
  );

  const textarea = (
    <>
      <label htmlFor="ai-pregunta" className="sr-only">
        {copy.placeholder}
      </label>
      <textarea
        id="ai-pregunta"
        value={draft}
        rows={1}
        enterKeyHint="send"
        autoComplete="off"
        placeholder={copy.placeholder}
        disabled={typing}
        aria-describedby={photoError ? "ai-composer-error ai-composer-note" : "ai-composer-note"}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        className={cn(
          "min-w-0 flex-1 resize-none border-0 bg-transparent text-fg outline-none placeholder:text-fg-muted focus-visible:ring-0 disabled:opacity-50",
          dockSlot
            ? "max-h-11 min-h-11 px-1.5 py-2.5 text-[16px] leading-5"
            : "block max-h-40 min-h-12 px-1.5 py-2 text-[15.5px] leading-6",
          !dockSlot && showCount && "pb-6",
        )}
      />
    </>
  );

  const sendButton = (
    <button
      type="submit"
      disabled={!canSend}
      aria-label={copy.send}
      title={copy.send}
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full transition-all duration-150 active:scale-95 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-9",
        canSend
          ? "cursor-pointer bg-fg text-bg hover:opacity-90"
          : "cursor-not-allowed bg-surface-2 text-fg-muted",
        FOCUS_RING,
      )}
    >
      <ArrowUpIcon />
    </button>
  );

  const stopButton = showStop ? (
    <button
      type="button"
      onClick={onStop}
      aria-label="Detener respuesta"
      title="Detener respuesta"
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-lg bg-down text-white transition hover:opacity-90 active:scale-95 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-9",
        FOCUS_RING,
      )}
    >
      <StopIcon />
    </button>
  ) : null;

  const attachButton = (
    <button
      type="button"
      onClick={onAttach}
      disabled={typing}
      aria-label={copy.attach}
      title={copy.attach}
      className={cn(
        "inline-flex shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-1 hover:text-fg active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-9",
        FOCUS_RING,
      )}
    >
      <CameraIcon />
    </button>
  );

  const webPill = (
    <button
      type="button"
      onClick={toggleWebSearch}
      aria-pressed={webSearchOn}
      title="Buscar en la web"
      className={cn(
        "inline-flex min-h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium transition active:scale-[0.98] motion-reduce:transition-none",
        webSearchOn
          ? "border-fg/20 bg-surface-1 text-fg"
          : "border-border/70 bg-white text-fg-muted hover:border-border-strong hover:bg-surface-1 hover:text-fg",
        FOCUS_RING,
      )}
    >
      <IconGlobe className="size-3.5" />
      <span className="whitespace-nowrap">Buscar en la web</span>
    </button>
  );

  const micButton = (
    <button
      type="button"
      onClick={toggleDictation}
      aria-pressed={listening}
      aria-label="Dictar pregunta"
      title={speechReady ? "Dictar pregunta" : "Dictado no disponible"}
      disabled={!speechReady}
      className={cn(
        "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
        dockSlot ? "size-11" : "size-8",
        listening
          ? "bg-down text-white hover:opacity-90"
          : "text-fg-muted hover:bg-surface-1 hover:text-fg",
        FOCUS_RING,
      )}
    >
      {listening ? <LevelBars /> : <MicIcon />}
    </button>
  );

  const toolPills =
    activeTools.length > 0 ? (
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {activeTools.map((id) => {
          const label = toolLabel(id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-1 py-1 pr-1 pl-2.5 text-[11.5px] font-medium text-fg-body"
            >
              <ToolGlyph id={id} />
              {label}
              <button
                type="button"
                onClick={() => onToggleTool?.(id)}
                aria-label={`Quitar ${label}`}
                title={`Quitar ${label}`}
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg active:scale-95 motion-reduce:transition-none",
                  FOCUS_RING,
                )}
              >
                <IconClose className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
    ) : null;

  const codeCard = codePasted ? (
    <div className="mb-2 overflow-hidden rounded-xl border border-border bg-surface-1/70">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
          PASTED
        </span>
        <button
          type="button"
          onClick={() => onDraft("")}
          aria-label="Quitar código pegado"
          title="Quitar código pegado"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg active:scale-95 motion-reduce:transition-none",
            FOCUS_RING,
          )}
        >
          <IconClose className="size-3.5" />
        </button>
      </div>
      <pre className="max-h-14 overflow-hidden px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] whitespace-pre text-fg-body">
        {draft.split("\n").slice(0, 3).join("\n")}
      </pre>
    </div>
  ) : null;

  const toolMenu = (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleMenu}
        aria-label="Herramientas avanzadas y adjuntos"
        title="Herramientas avanzadas y adjuntos"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn(
          "inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full transition active:scale-95 motion-reduce:transition-none",
          dockSlot ? "size-11" : "size-9",
          menuOpen
            ? "bg-fg text-bg hover:opacity-90"
            : "text-fg-muted hover:bg-surface-1 hover:text-fg",
          FOCUS_RING,
        )}
      >
        <PlusIcon open={menuOpen} />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Herramientas avanzadas y adjuntos"
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-2xl border border-border bg-white p-1.5 shadow-[0_18px_40px_-24px_rgba(12,15,20,0.35)]"
        >
          {menuView === "main" ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={uploadPhoto}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-fg-body transition hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
                  FOCUS_RING,
                )}
              >
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-body">
                  <PaperclipIcon />
                </span>
                Subir foto de cartera
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuView("charts")}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-fg-body transition hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
                  FOCUS_RING,
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-body">
                    <ChartIcon />
                  </span>
                  Gráficos
                </span>
                <IconChevron className="size-3.5 -rotate-90 text-fg-muted" />
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuView("analysis")}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-fg-body transition hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
                  FOCUS_RING,
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-body">
                    <AnalysisIcon />
                  </span>
                  Análisis
                </span>
                <IconChevron className="size-3.5 -rotate-90 text-fg-muted" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMenuView("main")}
                className={cn(
                  "mb-1 flex w-full items-center gap-1 rounded-xl px-2.5 py-1.5 text-left text-[11px] font-semibold text-fg-muted transition hover:bg-surface-1 hover:text-fg motion-reduce:transition-none",
                  FOCUS_RING,
                )}
              >
                <IconChevron className="size-3.5 rotate-90" />
                Volver
              </button>
              <p className="px-2.5 pt-0.5 pb-1 text-[10px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
                {menuView === "charts" ? "Gráficos" : "Análisis"}
              </p>
              {(menuView === "charts" ? CHART_TOOLS : ANALYSIS_TOOLS).map((id) => {
                const label = toolLabel(id);
                const active = activeTools.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={active}
                    onClick={() => onToggleTool?.(id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition motion-reduce:transition-none",
                      active
                        ? "bg-surface-1 font-medium text-fg"
                        : "text-fg-body hover:bg-surface-1 hover:text-fg",
                      FOCUS_RING,
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-body">
                        <ToolGlyph id={id} />
                      </span>
                      {label}
                    </span>
                    {active ? (
                      <IconCheck className="size-3.5 text-up" />
                    ) : (
                      <span className="text-[10px] font-medium tracking-[0.08em] text-fg-muted uppercase">
                        Añadir
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  // En escritorio las sugerencias viven bajo el compositor; en móvil, la grilla
  // del estado vacío ya las ofrece más grande, así que aquí no se repiten.
  const chips = suggestions ? (
    <div className="mt-3 hidden min-w-0 flex-wrap items-center justify-center gap-2 lg:flex">
      {copy.suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={typing}
          onClick={() => onSuggest(item.id, item.text)}
          className={cn(
            "min-h-9 shrink-0 touch-manipulation cursor-pointer rounded-full border border-border/75 bg-white px-3.5 text-[12.5px] font-medium text-fg-body transition hover:border-border-strong hover:bg-surface-1 hover:text-fg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
            FOCUS_RING,
          )}
        >
          {item.text}
        </button>
      ))}
    </div>
  ) : null;

  // Aviso permanente y único: se renderiza una sola vez en cada variante
  // (dock móvil o compositor de escritorio), nunca junto a otro igual.
  const adviceNotice = (
    <p
      id="ai-composer-note"
      role="note"
      data-ai-advice-notice
      className="mx-auto max-w-[46ch] px-1 pt-2.5 text-center text-[11.5px] leading-relaxed text-balance text-fg-muted sm:text-xs"
    >
      {copy.adviceNotice}
    </p>
  );

  if (dockSlot) {
    // Móvil: el formulario vive dentro de la barra inferior (dock); foto, error y aviso quedan sobre ella.
    return (
      <>
        <div className="mx-auto w-full max-w-2xl min-w-0 px-4 pt-1.5 pb-1 sm:px-6">
          {/* Selector de modo también en móvil, encima de la barra del dock. */}
          <div
            aria-disabled={typing || undefined}
            className={cn(
              "mb-1.5 flex items-center justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              typing && "pointer-events-none opacity-60",
            )}
          >
            <ReasoningModeBar mode={mode} onChange={handleModeChange} />
          </div>
          {pendingBlock}
          {errorBlock}
          {adviceNotice}
        </div>
        {createPortal(
          <form
            onSubmit={submit}
            aria-busy={typing || undefined}
            className="flex min-h-12 w-full min-w-0 items-center gap-1.5 px-1"
          >
            {attachButton}
            {fileInput}
            {textarea}
            {sendButton}
            {stopButton}
          </form>,
          dockSlot,
        )}
      </>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-busy={typing || undefined}
      className="mx-auto w-full max-w-2xl min-w-0 px-4 pt-2 pb-3 sm:px-6 sm:pb-4 lg:px-0 lg:pb-6"
    >
      {pendingBlock}
      {errorBlock}

      <div
        className={cn(
          "border border-[#DBDBDB] bg-white shadow-[inset_0_0_1px_0_rgba(0,0,0,0.85),0_1px_2px_0_rgba(0,0,0,0.04),0_2px_12px_0_rgba(0,0,0,0.03)] transition-all focus-within:border-fg/25",
          variant === "landing" ? "rounded-3xl p-3" : "rounded-2xl p-2.5",
        )}
      >
        {toolPills}
        {codeCard}

        <div className="relative flex min-w-0 items-end">
          {textarea}
          {showCount ? (
            <p
              aria-live="polite"
              className="pointer-events-none absolute right-1.5 bottom-1 text-[11px] leading-none tabular-nums text-fg-muted"
            >
              {draft.length}
            </p>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {toolMenu}
            {attachButton}
            {fileInput}
            {webPill}
            <ReasoningModeBar mode={mode} onChange={handleModeChange} />
            <ModelSelector
              variant="inline"
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {micButton}
            {showStop ? stopButton : sendButton}
          </div>
        </div>
      </div>

      {chips}
      {adviceNotice}
    </form>
  );
}

function PlusIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn(
        "size-4 transition-transform duration-200 motion-reduce:transition-none",
        open && "rotate-45",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 12.5V3.5M4.5 6.6 8 3.2l3.5 3.4" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5.25" y="5.25" width="5.5" height="5.5" rx="1.3" fill="currentColor" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="2.5" width="4" height="7" rx="2" />
      <path d="M4 7.5v.4a4 4 0 0 0 8 0v-.4M8 11.9v1.4M6.2 13.3h3.6" />
    </svg>
  );
}

function LevelBars() {
  return (
    <span aria-hidden="true" className="flex items-center gap-[2px]">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[2px] rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none",
            bar === 0 || bar === 4 ? "h-2" : bar === 1 || bar === 3 ? "h-3" : "h-3.5",
          )}
          style={{ animationDelay: `${bar * 90}ms` }}
        />
      ))}
    </span>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4.5" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6 3.5h4l.8 1.3H13a1.2 1.2 0 0 1 1.2 1.2v6.3A1.2 1.2 0 0 1 13 13.5H3A1.2 1.2 0 0 1 1.8 12.3V6A1.2 1.2 0 0 1 3 4.8h2.2L6 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.6" r="2.1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.8 5.2 5.6 10.4a1.7 1.7 0 0 0 2.4 2.4l5.4-5.4a3 3 0 0 0-4.3-4.3L3.7 8.5a4.3 4.3 0 0 0 6.1 6.1" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 13.5h11M5 13.5v-4M8 13.5V5M11 13.5V7.5" />
    </svg>
  );
}

function AnalysisIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 11.5 6 8l2.5 2.5L13.5 4.5" />
      <path d="M10.5 4.5h3v3" />
    </svg>
  );
}

function ToolGlyph({ id }: { id: string }) {
  return id.startsWith("chart_") ? <ChartIcon /> : <AnalysisIcon />;
}
