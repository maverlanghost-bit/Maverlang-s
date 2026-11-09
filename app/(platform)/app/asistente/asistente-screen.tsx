"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";

import { postAssistant } from "@/components/ai/api";
import { isValidChatId, parseChatPath, replaceChatUrl } from "@/components/ai/chat-url";
import { ChatView } from "@/components/ai/chat-view";
import {
  buildContextDirective,
  removeContextItem,
  toggleContextItem,
  type ContextItem,
  type ContextSnapshot,
} from "@/components/ai/context-types";
import { ImagePrepError, compressImageFile } from "@/components/ai/image";
import {
  announceAssistant,
  buildAiRequest,
  cleanTicker,
  createId,
  endpointFor,
  MAX_TEXT,
  publishChatSnapshot,
  readChatSnapshot,
  resetChatSnapshot,
  resolveChatScope,
  seedQuestion,
  type ChatMessage,
  type ChatScope,
} from "@/components/ai/model";
import { ChatSearchDialog } from "@/components/ai/nav-chats";
import { notifySessionsChanged, useSavedChats } from "@/components/ai/sessions-live";
import {
  deleteSavedChat,
  exportChatToMarkdown,
  renameSavedChat,
  togglePinSavedChat,
  upsertSavedChat,
  type AdvancedToolId,
  type SavedChatItem,
} from "@/components/ai/sessions-store";
import { ShareChatDialog } from "@/components/ai/share-chat-dialog";
import { tickerBySymbol } from "@/config/tickers";
import { asistenteText, type AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { useSession } from "@/lib/auth/session-context";
import { usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";

const EMPTY: ChatMessage[] = [];
const HISTORY_EVENT = "mv-ai-chat";
const SELECT_EVENT = "maverlang:ai-select-chat";
const ACTION_EVENT = "maverlang:ai-chat-action";
const MAX_TITLE = 60;
/** En el servidor no hay pintura; en el cliente se limpia antes del primer frame. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const TOOL_LABELS: Readonly<Record<AdvancedToolId, string>> = {
  chart_bar: "Gráfico de barras",
  chart_line: "Gráfico de líneas",
  chart_pie: "Gráfico circular",
  chart_area: "Gráfico de área",
  chart_radar: "Gráfico de radar",
  fin_metrics: "Análisis fundamental",
  stock_compare: "Comparar acciones",
  sector_perf: "Rendimiento sectorial",
};

type Feedback = "like" | "dislike";
type ChatAction =
  | { type: "new" }
  | { type: "search" }
  | { type: "share"; chatId?: string }
  | { type: "sessions-changed" }
  | { type: "rename"; chatId: string; title: string }
  | { type: "pin"; chatId: string }
  | { type: "delete"; chatId: string };

function emitHistory() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

function subscribeChat(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(HISTORY_EVENT, onChange);
  return () => window.removeEventListener(HISTORY_EVENT, onChange);
}

function serverSnapshot(): ChatMessage[] {
  return EMPTY;
}

function isToolId(value: string): value is AdvancedToolId {
  return Object.prototype.hasOwnProperty.call(TOOL_LABELS, value);
}

function titleFromMessages(messages: readonly ChatMessage[]): string {
  const first = messages.find((message) => message.role === "user" && message.text.trim().length > 0);
  const clean = (first?.text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "Nueva conversación";
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean;
}

/** Recupera la conversación activa tras recargar, sin guardar el id aparte. */
function findMatchingChatId(chats: readonly SavedChatItem[], messages: readonly ChatMessage[]): string | null {
  if (messages.length === 0) return null;
  const first = messages.find((message) => message.role === "user")?.text ?? "";
  const match = chats.find(
    (chat) =>
      chat.messages.length === messages.length &&
      (chat.messages.find((message) => message.role === "user")?.text ?? "") === first,
  );
  return match?.id ?? null;
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "conversacion"
  );
}

export function AsistenteScreen({
  initialQuery,
  initialTicker,
  initialChatId,
}: {
  initialQuery: string;
  initialTicker: string;
  /** Id pedido por la URL en una carga directa (`/app/asistente/c/<id>`). */
  initialChatId?: string;
}) {
  const { language, t } = useT();
  const copy = asistenteText(language);
  const ticker = cleanTicker(initialTicker);
  const session = useSession();
  const userId = session.user?.id ?? null;
  const scope = useMemo(() => resolveChatScope(session.status, userId), [session.status, userId]);
  const scopeKey = scope?.key ?? null;
  const messages = useSyncExternalStore(subscribeChat, () => readChatSnapshot(scope), serverSnapshot);
  const savedChats = useSavedChats(scopeKey);

  const [draft, setDraft] = useState(() => seedQuestion(initialQuery, initialTicker, copy.seed));
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [active, setActive] = useState<{ key: string | null; id: string | null }>({ key: null, id: null });
  const [selectedModel, setSelectedModel] = useState<"fast" | "pro">("fast");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [activeTools, setActiveTools] = useState<AdvancedToolId[]>([]);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [shareChatId, setShareChatId] = useState<string | null>(null);
  const [sharePair, setSharePair] = useState<{ question: string; answer: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);

  /** Cartera sólo se consulta cuando el contexto la necesita (evita fetch ocioso). */
  const portfolio = usePortfolio(contextItems.length > 0);
  const contextSymbols = useMemo(
    () => contextItems.filter((item) => item.kind !== "portfolio").map((item) => item.symbol),
    [contextItems],
  );
  const contextPrices = usePrices(contextSymbols, contextSymbols.length > 0);
  /** Sólo cifras finitas: si falta un dato queda `null` y la directiva lo omite. */
  const contextSnapshot = useMemo<ContextSnapshot>(() => {
    const data = portfolio.data;
    const totalUsd =
      typeof data?.totalUsd === "number" && Number.isFinite(data.totalUsd) ? data.totalUsd : null;
    const positions = (data?.positions ?? []).map((position) => {
      const valueUsd =
        typeof position.valueUsd === "number" && Number.isFinite(position.valueUsd)
          ? position.valueUsd
          : null;
      const weightPct = totalUsd !== null && totalUsd > 0 && valueUsd !== null ? (valueUsd / totalUsd) * 100 : null;
      return {
        symbol: position.symbol,
        name: tickerBySymbol(position.symbol)?.name ?? position.symbol,
        valueUsd,
        weightPct,
      };
    });
    const prices: Record<string, number | null> = {};
    for (const symbol of contextSymbols) {
      const quote = contextPrices.data?.find((row) => row.symbol.toLowerCase() === symbol.toLowerCase());
      prices[symbol] = quote && Number.isFinite(quote.priceUsd) ? quote.priceUsd : null;
    }
    return { totalUsd, positions, prices };
  }, [portfolio.data, contextPrices.data, contextSymbols]);

  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  /** Cambia con la identidad o al cambiar de conversación: invalida respuestas tardías. */
  const epoch = useRef(0);
  const lastIdentity = useRef<string | null | undefined>(undefined);
  const hadIdentity = useRef(false);
  /** Última identidad pintada; cubre la ventana entre render y layout effect. */
  const scopeKeyRef = useRef<string | null>(scopeKey);
  /** Id de la conversación vigente, legible desde promesas en vuelo. */
  const activeIdRef = useRef<string | null>(null);
  /** Chat pedido por la URL al montar; sólo se aplica una vez. */
  const initialChatIdRef = useRef<string | null>(
    initialChatId && isValidChatId(initialChatId) ? initialChatId : null,
  );
  /** Último id publicado en la URL: evita `replaceState` repetidos y bucles. */
  const urlChatIdRef = useRef<string | null>(initialChatIdRef.current);
  /** La carga directa ya se resolvió (abrió el chat o descartó el id). */
  const initialAppliedRef = useRef(false);

  const remembered = active.key === scopeKey ? active.id : undefined;
  const activeChatId = remembered !== undefined ? remembered : findMatchingChatId(savedChats, messages);
  const activeChat = activeChatId ? (savedChats.find((chat) => chat.id === activeChatId) ?? null) : null;
  const chatTitle = activeChat?.title ?? titleFromMessages(messages);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Al cambiar la identidad se vacía todo lo efímero de la sesión anterior.
   * La primera identidad real (después de `loading`) conserva el borrador que
   * viene de `?q=`; los cambios posteriores no.
   */
  useIsomorphicLayoutEffect(() => {
    scopeKeyRef.current = scopeKey;
    const previous = lastIdentity.current;
    if (previous === scopeKey) return;
    lastIdentity.current = scopeKey;

    if (previous === undefined) {
      if (scopeKey !== null) hadIdentity.current = true;
      return;
    }

    const firstRealIdentity = !hadIdentity.current && scopeKey !== null;
    if (scopeKey !== null) hadIdentity.current = true;
    if (firstRealIdentity) return;

    epoch.current += 1;
    busy.current = false;
    activeIdRef.current = null;
    setActive({ key: scopeKey, id: null });
    setTyping(false);
    setPhotoError(null);
    setAnnouncement("");
    setPendingImage(null);
    setDraft("");
    setContextItems([]);
    // Otra identidad: la conversación de la URL ya no es de este scope.
    syncChatUrl(null);
  }, [scopeKey]);

  /** Al montar, la URL manda: recupera el id aunque no llegue por props. */
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined" || initialChatIdRef.current) return;
    const { chatId } = parseChatPath(window.location.pathname);
    if (!chatId) return;
    initialChatIdRef.current = chatId;
    urlChatIdRef.current = chatId;
  }, []);

  /**
   * Carga directa de `/app/asistente/c/<id>`: se espera a la identidad y al
   * historial para no parpadear el estado vacío. Si el id no existe en este
   * navegador queda un chat vacío y la URL vuelve a `/app/asistente`.
   */
  useIsomorphicLayoutEffect(() => {
    if (initialAppliedRef.current) return;
    const wanted = initialChatIdRef.current;
    if (!wanted || scopeKey === null || session.status === "loading") return;
    initialAppliedRef.current = true;
    if (savedChats.some((chat) => chat.id === wanted)) selectChat(wanted);
    else syncChatUrl(null);
  }, [savedChats, scopeKey, session.status]);

  /** Atrás/adelante: la URL decide el chat y el guardado nunca se borra. */
  useEffect(() => {
    const onPopState = () => {
      const { chatId } = parseChatPath(window.location.pathname);
      urlChatIdRef.current = chatId;
      if (chatId === (activeIdRef.current ?? activeChatId)) return;
      // La entrada del historial cambió: la respuesta en vuelo ya no aplica.
      busy.current = false;
      if (chatId) {
        if (savedChats.some((chat) => chat.id === chatId)) {
          selectChat(chatId);
          return;
        }
        syncChatUrl(null);
      }
      newChat();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });

  function publish(activeScope: ChatScope | null, activeEpoch: number, next: readonly ChatMessage[]): boolean {
    if (epoch.current !== activeEpoch) return false;
    if (scopeKeyRef.current !== (activeScope?.key ?? null)) return false;
    if (!publishChatSnapshot(activeScope, next)) return false;
    emitHistory();
    return true;
  }

  /**
   * La URL sólo es espejo del chat activo: se reescribe con `replaceState`
   * (nunca `router.push`) para no remontar la pantalla ni cortar el stream.
   */
  function syncChatUrl(chatId: string | null): void {
    if (urlChatIdRef.current === chatId) return;
    urlChatIdRef.current = chatId;
    replaceChatUrl(chatId);
  }

  /** Guarda la conversación vigente en el historial del scope (única fuente). */
  function persistCurrent(next: readonly ChatMessage[]): void {
    if (!scopeKey || next.length === 0) return;
    // El id se fija antes de la URL: reusa el vigente o reabre el recuperado.
    const id = activeIdRef.current ?? activeChatId ?? createId();
    const previous = savedChats.find((chat) => chat.id === id);
    const chat: SavedChatItem = {
      id,
      title: previous?.title ?? titleFromMessages(next),
      updatedAt: Date.now(),
      pinned: previous?.pinned,
      messages: [...next],
    };
    upsertSavedChat(scopeKey, chat);
    if (activeIdRef.current !== id) {
      activeIdRef.current = id;
      setActive({ key: scopeKey, id });
    }
    // El id ya está fijado antes de tocar la URL: cada chat tiene la suya.
    syncChatUrl(id);
    notifySessionsChanged();
  }

  /** Las herramientas y la búsqueda web entran como instrucción al modelo. */
  function applyDirectives(list: readonly ChatMessage[]): ChatMessage[] {
    const hints: string[] = [];
    // El contexto adjunto va primero para que el modelo lo lea antes que el resto.
    const contextDirective = buildContextDirective(contextItems, contextSnapshot);
    if (contextDirective) hints.push(contextDirective);
    if (selectedModel === "pro") hints.push("Razona con profundidad antes de responder.");
    if (webSearchEnabled) hints.push("Busca en la web y cita las fuentes que uses.");
    if (activeTools.length > 0) {
      hints.push(`Usa estas herramientas de análisis: ${activeTools.map((id) => TOOL_LABELS[id]).join(", ")}.`);
    }
    if (hints.length === 0) return [...list];
    const prefix = `${hints.join(" ")}\n\n`;
    const lastUser = [...list].reverse().find((message) => message.role === "user");
    if (!lastUser) return [...list];
    return list.map((message) => (message.id === lastUser.id ? { ...message, text: `${prefix}${message.text}` } : message));
  }

  function buildBody(list: readonly ChatMessage[], image: string | null): ReturnType<typeof buildAiRequest> {
    return buildAiRequest({ messages: applyDirectives(list), image: image ?? undefined, ticker });
  }

  async function run(
    path: ReturnType<typeof endpointFor>,
    body: ReturnType<typeof buildAiRequest>,
    activeScope: ChatScope | null,
    activeEpoch: number,
  ) {
    busy.current = true;
    setTyping(true);
    const result = await postAssistant(path, body);
    // La identidad o la conversación cambió mientras esperábamos: se descarta.
    if (epoch.current !== activeEpoch || scopeKeyRef.current !== (activeScope?.key ?? null)) return;
    const labels = {
      ready: copy.ready,
      compare: copy.compareTitle,
      portfolio: copy.portfolioTitle,
      buy: copy.buyCta,
      photo: copy.photoCaption,
    };
    const fallback = result.ok
      ? ""
      : result.error === "not_configured"
        ? copy.notConfigured
        : result.error === "rate_limited"
          ? copy.rateBody
          : copy.errorBody;
    const message: ChatMessage = result.ok
      ? { id: createId(), role: "assistant", text: result.text, widgets: result.widgets }
      : {
          id: createId(),
          role: "assistant",
          text: "",
          notice: { kind: result.error, message: result.message.trim() || fallback },
        };
    const next = [...readChatSnapshot(activeScope), message];
    const published = publish(activeScope, activeEpoch, next);
    busy.current = false;
    if (!alive.current) return;
    setTyping(false);
    if (published) {
      persistCurrent(next);
      setAnnouncement(announceAssistant(message, labels));
    }
  }

  async function send(textOverride?: string, imageOverride?: string | null) {
    if (busy.current) return;
    const activeScope = scope;
    const activeEpoch = epoch.current;
    const image = imageOverride === undefined ? pendingImage : imageOverride;
    const raw = (textOverride ?? draft).trim();
    const text = (raw || (image ? copy.photoCaption : "")).slice(0, MAX_TEXT);
    if (!text) return;
    const user: ChatMessage = { id: createId(), role: "user", text };
    if (image) user.imageDataUrl = image;
    const next = [...readChatSnapshot(activeScope), user];
    if (!publish(activeScope, activeEpoch, next)) return;
    if (textOverride == null) setDraft("");
    if (imageOverride === undefined) setPendingImage(null);
    setPhotoError(null);
    persistCurrent(next);
    await run(endpointFor(Boolean(image)), buildBody(next, image), activeScope, activeEpoch);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const activeEpoch = epoch.current;
    const activeScopeKey = scopeKey;
    try {
      const dataUrl = await compressImageFile(file);
      if (!alive.current || epoch.current !== activeEpoch || scopeKeyRef.current !== activeScopeKey) return;
      setPendingImage(dataUrl);
      setPhotoError(null);
    } catch (error) {
      if (!alive.current || epoch.current !== activeEpoch || scopeKeyRef.current !== activeScopeKey) return;
      const code = error instanceof ImagePrepError ? error.code : "fail";
      setPhotoError(code === "size" ? copy.photoBig : code === "type" ? copy.photoType : copy.photoFail);
    }
  }

  function onSuggest(id: AsistenteSuggestionId, text: string) {
    if (id === "import") {
      fileRef.current?.click();
      return;
    }
    void send(text, null);
  }

  function selectChat(chatId: string) {
    if (busy.current || !scope) return;
    const chat = savedChats.find((item) => item.id === chatId);
    if (!chat) return;
    if (!publishChatSnapshot(scope, chat.messages.map((message) => ({ ...message })))) return;
    epoch.current += 1;
    busy.current = false;
    activeIdRef.current = chat.id;
    setActive({ key: scopeKey, id: chat.id });
    setTyping(false);
    setDraft("");
    setContextItems([]);
    setPendingImage(null);
    setPhotoError(null);
    setAnnouncement("");
    setFeedback({});
    setSearchOpen(false);
    setShareOpen(false);
    setSharePair(null);
    // Clic en el historial: la URL pasa a la del chat elegido.
    syncChatUrl(chat.id);
    emitHistory();
  }

  function newChat() {
    if (busy.current) return;
    epoch.current += 1;
    resetChatSnapshot(scope);
    activeIdRef.current = null;
    setActive({ key: scopeKey, id: null });
    setDraft("");
    setContextItems([]);
    setPendingImage(null);
    setPhotoError(null);
    setAnnouncement("");
    setFeedback({});
    // Chat nuevo: la URL vuelve a la vista general (sin tocar el guardado).
    syncChatUrl(null);
    emitHistory();
  }

  function renameChat(chatId: string, title: string) {
    if (!scopeKey) return;
    renameSavedChat(scopeKey, chatId, title);
    notifySessionsChanged();
  }

  function togglePinChat(chatId: string) {
    if (!scopeKey) return;
    togglePinSavedChat(scopeKey, chatId);
    notifySessionsChanged();
  }

  function deleteChat(chatId: string) {
    if (!scopeKey) return;
    deleteSavedChat(scopeKey, chatId);
    notifySessionsChanged();
    setShareOpen(false);
    if (chatId === activeIdRef.current || chatId === activeChatId) {
      epoch.current += 1;
      busy.current = false;
      resetChatSnapshot(scope);
      activeIdRef.current = null;
      setActive({ key: scopeKey, id: null });
      setTyping(false);
      setAnnouncement("");
      setContextItems([]);
      // Se borró la conversación activa: la URL vuelve a `/app/asistente`.
      syncChatUrl(null);
      emitHistory();
    }
  }

  async function editUserMessage(messageId: string, newText: string) {
    if (busy.current) return;
    const clean = newText.trim().slice(0, MAX_TEXT);
    if (!clean) return;
    const activeScope = scope;
    const activeEpoch = epoch.current;
    const current = readChatSnapshot(activeScope);
    const index = current.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const next = current
      .slice(0, index + 1)
      .map((message) => (message.id === messageId ? { ...message, text: clean } : message));
    if (!publish(activeScope, activeEpoch, next)) return;
    const image = next[index]?.imageDataUrl ?? null;
    persistCurrent(next);
    setAnnouncement("");
    await run(endpointFor(Boolean(image)), buildBody(next, image), activeScope, activeEpoch);
  }

  async function retryLastResponse() {
    if (busy.current) return;
    const activeScope = scope;
    const activeEpoch = epoch.current;
    const next = readChatSnapshot(activeScope).slice();
    while (next.length > 0 && next[next.length - 1]?.role === "assistant") next.pop();
    if (next.length === 0) return;
    if (!publish(activeScope, activeEpoch, next)) return;
    const image = [...next].reverse().find((message) => message.role === "user")?.imageDataUrl ?? null;
    persistCurrent(next);
    setAnnouncement("");
    await run(endpointFor(Boolean(image)), buildBody(next, image), activeScope, activeEpoch);
  }

  function stop() {
    epoch.current += 1;
    busy.current = false;
    setTyping(false);
    setAnnouncement("");
  }

  function handleFeedback(messageId: string, type: Feedback) {
    setFeedback((current) => {
      const next = { ...current };
      if (next[messageId] === type) delete next[messageId];
      else next[messageId] = type;
      return next;
    });
  }

  function toggleTool(toolId: string) {
    if (!isToolId(toolId)) return;
    setActiveTools((current) =>
      current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId],
    );
  }

  function toggleContext(item: ContextItem) {
    setContextItems((current) => toggleContextItem(current, item));
  }

  function removeContext(id: string) {
    setContextItems((current) => removeContextItem(current, id));
  }

  function copyAllText() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(exportChatToMarkdown(chatTitle, messages)).catch(() => {});
  }

  function exportMarkdown() {
    if (typeof window === "undefined") return;
    const markdown = exportChatToMarkdown(chatTitle, messages);
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(chatTitle)}-maverlang.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openShare(chatId?: string) {
    setShareChatId(chatId ?? null);
    setSharePair(null);
    setShareOpen(true);
  }

  function openShareAnswer(messageId: string) {
    const index = messages.findIndex((message) => message.id === messageId);
    const answer = index >= 0 ? messages[index] : null;
    if (!answer) return;
    let question = "";
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") {
        question = messages[i].text;
        break;
      }
    }
    setShareChatId(null);
    setSharePair({ question, answer: answer.text });
    setShareOpen(true);
  }

  useEffect(() => {
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; id?: string; text?: string }>).detail;
      if (!detail) return;
      if (detail.type === "clear") {
        newChat();
      } else if (detail.type === "attach") {
        fileRef.current?.click();
      } else if (detail.type === "prompt" && detail.text) {
        if (detail.id === "import" || detail.id === "photo") fileRef.current?.click();
        else void send(detail.text, null);
      }
    };
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: string }>).detail;
      if (detail?.chatId) selectChat(detail.chatId);
    };
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<ChatAction>).detail;
      if (!detail) return;
      if (detail.type === "new") newChat();
      else if (detail.type === "search") setSearchOpen(true);
      else if (detail.type === "share") openShare(detail.chatId ?? undefined);
      else if (detail.type === "rename") renameChat(detail.chatId, detail.title);
      else if (detail.type === "pin") togglePinChat(detail.chatId);
      else if (detail.type === "delete") deleteChat(detail.chatId);
    };
    window.addEventListener("mv-ai-command", onCommand);
    window.addEventListener(SELECT_EVENT, onSelect);
    window.addEventListener(ACTION_EVENT, onAction);
    return () => {
      window.removeEventListener("mv-ai-command", onCommand);
      window.removeEventListener(SELECT_EVENT, onSelect);
      window.removeEventListener(ACTION_EVENT, onAction);
    };
  });

  const sharedChat = shareChatId ? (savedChats.find((chat) => chat.id === shareChatId) ?? null) : null;

  return (
    <>
      <ChatView
        copy={copy}
        messages={messages}
        draft={draft}
        pendingImage={pendingImage}
        typing={typing}
        photoError={photoError}
        announcement={typing ? copy.typing : announcement}
        onDraft={setDraft}
        onSubmit={() => void send()}
        onSuggest={onSuggest}
        onAttach={() => fileRef.current?.click()}
        onFile={(event) => void onFile(event)}
        onRemoveImage={() => setPendingImage(null)}
        onRetry={() => void retryLastResponse()}
        onClear={newChat}
        fileRef={fileRef}
        backLabel={t.detail.backToMarket}
        chatTitle={chatTitle}
        isPinned={activeChat?.pinned === true}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onRenameChat={(title) => {
          if (activeChatId) renameChat(activeChatId, title);
        }}
        onTogglePin={() => {
          if (activeChatId) togglePinChat(activeChatId);
        }}
        onNewChat={newChat}
        onShareChat={() => openShare(activeChatId ?? undefined)}
        onCopyAllText={copyAllText}
        onExportMarkdown={exportMarkdown}
        onDeleteChat={() => {
          if (activeChatId) deleteChat(activeChatId);
        }}
        onOpenSearch={() => setSearchOpen(true)}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={() => setWebSearchEnabled((current) => !current)}
        activeTools={activeTools}
        onToggleTool={toggleTool}
        contextItems={contextItems}
        onToggleContext={toggleContext}
        onRemoveContext={removeContext}
        onStop={stop}
        onEditMessage={(messageId, text) => void editUserMessage(messageId, text)}
        feedback={feedback}
        onFeedback={handleFeedback}
        onShareAnswer={openShareAnswer}
        onRetryAnswer={() => void retryLastResponse()}
      />

      <ShareChatDialog
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) setSharePair(null);
        }}
        chatTitle={sharedChat?.title ?? chatTitle}
        messages={sharedChat?.messages ?? messages}
        singlePair={sharePair}
      />

      <ChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        chats={savedChats}
        onSelectChat={selectChat}
        onNewChat={() => {
          setSearchOpen(false);
          newChat();
        }}
      />
    </>
  );
}
