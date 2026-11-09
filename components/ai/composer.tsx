"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { isCodeSnippet } from "@/components/ai/code-block";
import type { ContextItem } from "@/components/ai/context-types";
import { ModelSelector } from "@/components/ai/model-selector";
import type { AsistenteCopy, AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { cn } from "@/lib/cn";

/** Frases del placeholder animado, en el mismo orden que chat-input.tsx. */
const CHAT_INPUT_PLACEHOLDERS = [
  "Pregúntame lo que quieras...",
  "Analiza mi portafolio...",
  "Analiza esta acción...",
  "Crea una alerta de precio para...",
  "Compara Tesla vs Apple...",
  "¿Qué opinas sobre el mercado hoy?...",
  "Analiza las finanzas de NVIDIA...",
  "Explica la última decisión de tasas de interés...",
] as const;

type MenuView = "main" | "charts" | "analysis";
type ToolCategory = "charts" | "analysis";

type AdvancedTool = {
  id: string;
  label: string;
  category: ToolCategory;
};

/** Mismas herramientas avanzadas que el compositor de referencia. */
const ADVANCED_TOOLS: readonly AdvancedTool[] = [
  { id: "chart_bar", label: "Gráfico de Barras", category: "charts" },
  { id: "chart_line", label: "Gráfico de Líneas", category: "charts" },
  { id: "chart_pie", label: "Gráfico Circular", category: "charts" },
  { id: "chart_area", label: "Gráfico de Área", category: "charts" },
  { id: "chart_radar", label: "Gráfico de Radar", category: "charts" },
  { id: "fin_metrics", label: "Análisis Fundamental", category: "analysis" },
  { id: "stock_compare", label: "Comparar Acciones", category: "analysis" },
  { id: "sector_perf", label: "Rendimiento Sectorial", category: "analysis" },
];

const CHART_TOOLS = ADVANCED_TOOLS.filter((tool) => tool.category === "charts");
const ANALYSIS_TOOLS = ADVANCED_TOOLS.filter((tool) => tool.category === "analysis");

const TOOL_LABELS: Readonly<Record<string, string>> = {
  chart_bar: "Gráfico de Barras",
  chart_line: "Gráfico de Líneas",
  chart_pie: "Gráfico Circular",
  chart_area: "Gráfico de Área",
  chart_radar: "Gráfico de Radar",
  fin_metrics: "Análisis Fundamental",
  stock_compare: "Comparar Acciones",
  sector_perf: "Rendimiento Sectorial",
};

type TypewriterState = {
  text: string;
  isDeleting: boolean;
  index: number;
};

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
  contextItems = [],
  onRemoveContext,
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
  contextItems?: readonly ContextItem[];
  onRemoveContext?: (id: string) => void;
}) {
  const isLanding = variant === "landing";
  const canSend = !typing && (draft.trim().length > 0 || pendingImage != null);
  const showStop = typing && onStop != null;
  const codePasted = isCodeSnippet(draft);

  // La búsqueda web puede venir controlada por el coordinador o vivir aquí.
  const [localWebSearch, setLocalWebSearch] = useState(false);
  const webSearchOn = webSearchEnabled ?? localWebSearch;
  const [deepReasoning, setDeepReasoning] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("main");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favorites, setFavorites] = useState<readonly string[]>([]);

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const draftRef = useRef(draft);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // El dictado necesita el borrador más reciente sin volver a suscribir el reconocedor.
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Montaje: habilita el typewriter y detecta la API de voz en el siguiente frame.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Typewriter del placeholder: sólo en la landing, sin borrador y ya montado.
  const [typewriter, setTypewriter] = useState<TypewriterState>({
    text: "",
    isDeleting: false,
    index: 0,
  });

  useEffect(() => {
    if (!mounted || !isLanding || draft !== "") return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const fullText = CHAT_INPUT_PLACEHOLDERS[typewriter.index % CHAT_INPUT_PLACEHOLDERS.length];
    const typingSpeed = typewriter.isDeleting ? 30 : 60;
    const delayBetweenWords = 2500;

    if (!typewriter.isDeleting && typewriter.text === fullText) {
      timer = setTimeout(() => {
        setTypewriter((prev) => ({ ...prev, isDeleting: true }));
      }, delayBetweenWords);
    } else if (typewriter.isDeleting && typewriter.text === "") {
      timer = setTimeout(() => {
        setTypewriter((prev) => ({
          text: "",
          isDeleting: false,
          index: (prev.index + 1) % CHAT_INPUT_PLACEHOLDERS.length,
        }));
      }, 0);
    } else {
      timer = setTimeout(() => {
        setTypewriter((prev) => {
          const currentFullText = CHAT_INPUT_PLACEHOLDERS[prev.index % CHAT_INPUT_PLACEHOLDERS.length];
          const nextText = prev.isDeleting
            ? currentFullText.substring(0, prev.text.length - 1)
            : currentFullText.substring(0, prev.text.length + 1);
          return { ...prev, text: nextText };
        });
      }, typingSpeed);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [typewriter, draft, mounted, isLanding]);

  const displayedPlaceholder = listening
    ? "Escuchando... habla ahora"
    : draft.length > 0
      ? ""
      : mounted && isLanding
        ? typewriter.text || " "
        : copy.placeholder;

  // Auto-resize del textarea hasta 256px.
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 256)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [draft, resizeTextarea]);

  // Al desmontar: cortar el micrófono y cualquier timer pendiente del menú.
  useEffect(() => {
    return () => {
      if (menuResetTimer.current) clearTimeout(menuResetTimer.current);
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

  // Popover de adjuntos: cierra con click fuera y con Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setMenuView("main");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMenuView("main");
      }
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

  function scheduleViewReset() {
    if (menuResetTimer.current) clearTimeout(menuResetTimer.current);
    menuResetTimer.current = setTimeout(() => setMenuView("main"), 200);
  }

  function uploadFile() {
    closeMenu();
    onAttach();
  }

  function pickTool(id: string) {
    onToggleTool?.(id);
    setMenuOpen(false);
    scheduleViewReset();
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition = speechRecognitionCtor();
    if (!Recognition) return;

    try {
      const recognition = new Recognition();
      recognition.lang = "es-CL";
      recognition.continuous = true;
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

  const openUpward = variant === "bottom";
  const hasAttachments = pendingImage != null || codePasted;
  const activeViewTools = menuView === "charts" ? CHART_TOOLS : ANALYSIS_TOOLS;
  const viewIsCharts = menuView === "charts";

  return (
    <form
      onSubmit={submit}
      aria-busy={typing || undefined}
      className="relative w-full min-w-0 max-w-full px-0 pt-0"
    >
      {/* Píldoras de herramientas activas, flotando sobre la caja. */}
      {activeTools.length > 0 ? (
        <div className="pointer-events-auto absolute bottom-full left-4 mb-2.5 flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {activeTools.map((toolId) => {
              const label = TOOL_LABELS[toolId] ?? toolId.replace(/_/g, " ");
              return (
                <motion.div
                  key={toolId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-800 shadow-sm"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50">
                    <ToolGlyph id={toolId} className="h-3 w-3 text-[#1890FF]" />
                  </span>
                  {label}
                  <button
                    type="button"
                    onClick={() => onToggleTool?.(toolId)}
                    aria-label={`Quitar ${label}`}
                    title={`Quitar ${label}`}
                    className="ml-1 cursor-pointer rounded-full p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <XGlyph className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : null}

      {photoError ? (
        <p
          id="ai-composer-error"
          role="alert"
          aria-live="polite"
          className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11.5px] leading-relaxed break-words text-red-700"
        >
          {photoError}
        </p>
      ) : null}

      {/* Caja contenedora del input. */}
      <div
        className={cn(
          "relative rounded-xl border border-[#DBDBDB] bg-white p-2.5",
          "shadow-[inset_0_0_1px_0_rgba(0,0,0,1),0_1px_2px_0_rgba(0,0,0,0.04),0_2px_12px_0_rgba(0,0,0,0.03)] transition-all duration-300 group focus-within:border-zinc-400",
          "focus-within:shadow-[inset_0_0_1px_0_rgba(0,0,0,1),0_1px_2px_0_rgba(0,0,0,0.04),0_4px_16px_0_rgba(0,0,0,0.06)]",
          listening && "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]",
        )}
      >
        {/* Previsualización de la foto pendiente y del código pegado. */}
        {hasAttachments ? (
          <div className="mb-2 flex flex-wrap gap-3 border-b border-border/20 p-3">
            <AnimatePresence initial={false}>
              {pendingImage ? (
                <motion.div
                  key="pending-image"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative h-22 w-22 overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-2 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={onRemoveImage}
                    aria-label={copy.removePhoto}
                    title={copy.removePhoto}
                    className="absolute top-1.5 right-1.5 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/75 text-white shadow-md transition-transform hover:bg-black active:scale-90"
                  >
                    <XGlyph className="h-2.5 w-2.5" />
                  </button>
                  {/* La foto es un data URL del usuario: el optimizador de Next no la acepta. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage}
                    alt={copy.photoAlt}
                    className="absolute inset-0 z-10 h-full w-full rounded-xl object-cover"
                  />
                </motion.div>
              ) : null}

              {codePasted ? (
                <motion.div
                  key="pasted-code"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative h-22 w-22 overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-2 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => onDraft("")}
                    aria-label="Quitar código pegado"
                    title="Quitar código pegado"
                    className="absolute top-1.5 right-1.5 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/75 text-white shadow-md transition-transform hover:bg-black active:scale-90"
                  >
                    <XGlyph className="h-2.5 w-2.5" />
                  </button>
                  <div className="flex h-full w-full flex-col justify-between overflow-hidden p-0.5 font-mono text-[7px] leading-normal text-zinc-500 select-none">
                    <div className="mb-1 max-w-[80%] truncate border-b border-zinc-200/60 pb-0.5 text-[9px] font-bold text-zinc-900">
                      codigo.txt
                    </div>
                    <div className="mb-1 line-clamp-4 leading-tight break-all opacity-70">{draft}</div>
                    <div className="self-start rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[7px] font-black tracking-wider text-blue-500 uppercase">
                      PASTED
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        {/* Chips de contexto del chat (sobre el textarea). */}
        {contextItems.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pb-2">
            {contextItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800"
              >
                <span className="font-semibold">{item.symbol}</span>
                <span className="max-w-28 truncate text-zinc-500">{item.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveContext?.(item.id)}
                  aria-label={`Quitar ${item.symbol} del contexto`}
                  title={`Quitar ${item.symbol} del contexto`}
                  className="ml-0.5 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                >
                  <XGlyph className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Textarea con auto-resize. */}
        <label htmlFor="ai-pregunta" className="sr-only">
          {copy.placeholder}
        </label>
        <div className="relative flex items-center bg-transparent">
          <textarea
            ref={textareaRef}
            id="ai-pregunta"
            name="input"
            data-bare-input=""
            value={draft}
            rows={1}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={displayedPlaceholder}
            aria-label={copy.placeholder}
            aria-describedby={photoError ? "ai-composer-error ai-composer-note" : "ai-composer-note"}
            onChange={(event) => onDraft(event.target.value)}
            onInput={resizeTextarea}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            className="min-h-12 max-h-72 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:ring-0"
          />
        </div>

        {/* Fila inferior de controles. */}
        <div className="mt-1 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {/* Menú de adjuntos y herramientas (botón +). */}
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={toggleMenu}
                aria-label="Opciones de adjuntos"
                aria-expanded={menuOpen}
                className={cn(
                  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-300",
                  menuOpen ? "bg-zinc-900 text-white shadow-md" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <PlusGlyph className={cn("h-5 w-5 transition-transform duration-300", menuOpen && "rotate-45")} />
              </button>

              <AnimatePresence>
                {menuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: openUpward ? 10 : -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: openUpward ? 10 : -10, scale: 0.95 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                    className={cn(
                      "absolute left-0 z-40 flex max-h-[350px] w-64 flex-col overflow-hidden rounded-2xl border border-gray-200/60 bg-white/95 p-2.5 shadow-2xl backdrop-blur-xl",
                      openUpward ? "bottom-12" : "top-12",
                    )}
                  >
                    <div className="flex-1 overflow-y-auto">
                      {menuView === "main" ? (
                        <motion.div
                          key="main"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                        >
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={uploadFile}
                              className="group/btn flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-50 hover:text-zinc-900 active:scale-[0.98]"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-zinc-900 transition-colors duration-200 group-hover/btn:bg-zinc-900 group-hover/btn:text-white">
                                <PaperclipGlyph className="h-4 w-4" />
                              </span>
                              Subir archivo
                            </button>
                          </div>

                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => setMenuView("charts")}
                              className="group/btn flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-50 hover:text-zinc-900 active:scale-[0.98]"
                            >
                              <span className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-zinc-900 transition-colors duration-200 group-hover/btn:bg-zinc-900 group-hover/btn:text-white">
                                  <PieChartGlyph className="h-4 w-4" />
                                </span>
                                Gráficos
                              </span>
                              <ChevronRightGlyph className="h-4 w-4 text-gray-400 transition-transform group-hover/btn:translate-x-0.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setMenuView("analysis")}
                              className="group/btn mt-1 flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-50 hover:text-zinc-900 active:scale-[0.98]"
                            >
                              <span className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-zinc-900 transition-colors duration-200 group-hover/btn:bg-zinc-900 group-hover/btn:text-white">
                                  <TrendingUpGlyph className="h-4 w-4" />
                                </span>
                                Análisis
                              </span>
                              <ChevronRightGlyph className="h-4 w-4 text-gray-400 transition-transform group-hover/btn:translate-x-0.5" />
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={menuView}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                        >
                          <button
                            type="button"
                            onClick={() => setMenuView("main")}
                            className="mb-2 flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[10px] font-black text-gray-500 transition-colors hover:text-gray-900"
                          >
                            <ChevronRightGlyph className="h-3.5 w-3.5 rotate-180" /> Volver
                          </button>
                          <div
                            className={cn(
                              "mb-1 px-2.5 py-1 text-[9px] font-black tracking-widest uppercase opacity-80",
                              viewIsCharts ? "text-[#1890FF]" : "text-purple-500",
                            )}
                          >
                            {viewIsCharts ? "Gráficos" : "Análisis"}
                          </div>
                          <div className="space-y-1">
                            {activeViewTools.map((tool) => {
                              const isActive = activeTools.includes(tool.id);
                              const isFavorite = favorites.includes(tool.id);
                              return (
                                <div
                                  key={tool.id}
                                  className={cn(
                                    "group flex w-full items-center justify-between rounded-xl border border-transparent px-2 py-1.5 transition-all duration-200",
                                    isActive &&
                                      (viewIsCharts
                                        ? "border-blue-100/50 bg-blue-50/50"
                                        : "border-purple-100/50 bg-purple-50/50"),
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => pickTool(tool.id)}
                                    className={cn(
                                      "flex flex-1 cursor-pointer items-center gap-3 text-left text-sm font-semibold transition-colors",
                                      isActive
                                        ? viewIsCharts
                                          ? "text-[#1890FF]"
                                          : "text-purple-600"
                                        : cn(
                                            "text-gray-700",
                                            viewIsCharts ? "hover:text-[#1890FF]" : "hover:text-purple-600",
                                          ),
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                                        isActive
                                          ? viewIsCharts
                                            ? "bg-[#1890FF] text-white"
                                            : "bg-purple-500 text-white"
                                          : viewIsCharts
                                            ? "bg-blue-50 text-blue-600"
                                            : "bg-purple-50 text-purple-600",
                                      )}
                                    >
                                      <ToolGlyph id={tool.id} className="h-4 w-4" />
                                    </span>
                                    {tool.label}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleFavorite(tool.id)}
                                    aria-label={
                                      isFavorite
                                        ? `Quitar ${tool.label} de favoritos`
                                        : `Añadir ${tool.label} a favoritos`
                                    }
                                    aria-pressed={isFavorite}
                                    className={cn(
                                      "cursor-pointer p-1.5 transition-all",
                                      isFavorite
                                        ? "text-amber-500"
                                        : "text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-500 focus-visible:opacity-100",
                                    )}
                                  >
                                    <StarGlyph
                                      className={cn("h-4 w-4", isFavorite && "fill-amber-500 text-amber-500")}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Píldoras sólo-icono: búsqueda web y razonamiento profundo. */}
            <div className="flex items-center gap-1.5 select-none">
              <button
                type="button"
                onClick={toggleWebSearch}
                aria-pressed={webSearchOn}
                aria-label="Buscar en la web"
                title="Buscar en la web"
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center justify-center rounded-full border px-3 transition-colors",
                  webSearchOn
                    ? "border-zinc-900 bg-zinc-900 text-white !bg-zinc-900 !text-white !border-zinc-900"
                    : "border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <GlobeGlyph className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeepReasoning((prev) => !prev)}
                aria-pressed={deepReasoning}
                aria-label="Razonamiento profundo"
                title="Razonamiento profundo"
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center justify-center rounded-full border px-3 transition-colors",
                  deepReasoning
                    ? "border-zinc-900 bg-zinc-900 text-white !bg-zinc-900 !text-white !border-zinc-900"
                    : "border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <SparklesGlyph className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModelSelector variant="inline" selectedModel={selectedModel} onSelectModel={onSelectModel} />

            {showStop ? (
              <button
                type="button"
                onClick={() => onStop?.()}
                aria-label="Detener generación"
                title="Detener generación"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.35)] transition-all hover:bg-red-600 active:scale-95"
              >
                <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
              </button>
            ) : listening || !canSend ? (
              <>
                <button
                  type="button"
                  onClick={toggleDictation}
                  aria-pressed={listening}
                  aria-label={listening ? "Detener grabación" : "Dictar pregunta"}
                  title="Dictar pregunta"
                  className={cn(
                    "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all",
                    listening
                      ? "animate-pulse bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.3)] hover:bg-red-600"
                      : "bg-zinc-900 text-white hover:opacity-90",
                  )}
                >
                  {listening ? (
                    <span className="pointer-events-none flex h-3.5 w-5 items-center justify-center gap-[2px] select-none">
                      {[1, 2, 3, 4, 5].map((bar) => (
                        <motion.span
                          key={bar}
                          className="w-[2px] shrink-0 rounded-full bg-white"
                          animate={{
                            height:
                              bar === 1 || bar === 5
                                ? ["4px", "8px", "4px"]
                                : bar === 2 || bar === 4
                                  ? ["6px", "12px", "6px"]
                                  : ["6px", "15px", "6px"],
                          }}
                          transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            repeatType: "reverse",
                            delay: bar * 0.08,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </span>
                  ) : (
                    <MicGlyph className="h-4.5 w-4.5" />
                  )}
                </button>
                <button type="submit" aria-label={copy.send} disabled={!canSend} className="sr-only">
                  {copy.send}
                </button>
              </>
            ) : (
              <button
                type="submit"
                aria-label={copy.send}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-900 text-white transition-opacity hover:opacity-90"
              >
                <ArrowUpGlyph className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <p id="ai-composer-note" role="note" data-ai-advice-notice className="sr-only">
        {copy.adviceNotice}
      </p>

      {/* Entradas ocultas y accesibilidad SSR. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="sr-only"
        onChange={onFile}
      />
      <button type="button" onClick={onAttach} aria-label={copy.attach} className="sr-only" />
      {suggestions ? (
        <div className="sr-only" aria-hidden="true">
          {copy.suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              tabIndex={-1}
              disabled={typing}
              onClick={() => onSuggest(item.id, item.text)}
            >
              {item.text}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

/* Glifos locales (sin lucide-react). */

type GlyphProps = { className?: string };

function PlusGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-5 w-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function ArrowUpGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function MicGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11v.6a6.5 6.5 0 0 0 13 0V11M12 18.2v3M9 21.2h6" />
    </svg>
  );
}

function GlobeGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.6 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.6-3.6-9S9.6 5.5 12 3Z" />
    </svg>
  );
}

function SparklesGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 3l1.9 4.9L17.8 9.8l-4.9 1.9L11 16.6l-1.9-4.9L4.2 9.8l4.9-1.9L11 3Z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </svg>
  );
}

function PaperclipGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.5 11.5 12 20a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}

function ChevronRightGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

function StarGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.4l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.6l5.9-.9L12 3.4Z" />
    </svg>
  );
}

function BarChartGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 20.5h18M6.5 20.5V11M12 20.5V4.5M17.5 20.5v-6" />
    </svg>
  );
}

function LineChartGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3v18h18" />
      <path d="M6.5 15.5 11 11l3.5 3.5L20 8" />
      <path d="M15.5 8H20v4.5" />
    </svg>
  );
}

function PieChartGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21.2 15.9A10 10 0 1 1 8.1 2.8" />
      <path d="M22 12A10 10 0 0 0 12 2v10h10Z" />
    </svg>
  );
}

function AreaChartGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3v18h18" />
      <path d="M6.5 15.5 11 10l3.5 3.5L20 7" />
      <path d="M6.5 15.5V19h13.5v-8.5L20 7 14.5 13.5 11 10 6.5 15.5Z" opacity="0.25" fill="currentColor" />
    </svg>
  );
}

function TargetGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TrendingUpGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function ScaleGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v18M7 21h10M4 7h16" />
      <path d="M7 7l-3 6a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
    </svg>
  );
}

function LayersGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 12.5 9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}

function ToolGlyph({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "chart_bar":
      return <BarChartGlyph className={className} />;
    case "chart_line":
      return <LineChartGlyph className={className} />;
    case "chart_pie":
      return <PieChartGlyph className={className} />;
    case "chart_area":
      return <AreaChartGlyph className={className} />;
    case "chart_radar":
      return <TargetGlyph className={className} />;
    case "fin_metrics":
      return <TrendingUpGlyph className={className} />;
    case "stock_compare":
      return <ScaleGlyph className={className} />;
    case "sector_perf":
      return <LayersGlyph className={className} />;
    default:
      return <BarChartGlyph className={className} />;
  }
}
