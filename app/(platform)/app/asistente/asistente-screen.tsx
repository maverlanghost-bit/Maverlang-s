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
import { ChatView } from "@/components/ai/chat-view";
import { ImagePrepError, compressImageFile } from "@/components/ai/image";
import {
  announceAssistant,
  buildAiRequest,
  cleanTicker,
  createId,
  endpointFor,
  publishChatSnapshot,
  readChatSnapshot,
  resetChatSnapshot,
  resolveChatScope,
  seedQuestion,
  MAX_TEXT,
  type ChatMessage,
  type ChatScope,
} from "@/components/ai/model";
import { asistenteText, type AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { useSession } from "@/lib/auth/session-context";
import { useT } from "@/lib/hooks/use-t";

const EMPTY: ChatMessage[] = [];
const HISTORY_EVENT = "mv-ai-chat";
/** En el servidor no hay pintura; en el cliente se limpia antes del primer frame. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

export function AsistenteScreen({
  initialQuery,
  initialTicker,
}: {
  initialQuery: string;
  initialTicker: string;
}) {
  const { language, t } = useT();
  const copy = asistenteText(language);
  const ticker = cleanTicker(initialTicker);
  const session = useSession();
  const userId = session.user?.id ?? null;
  const scope = useMemo(() => resolveChatScope(session.status, userId), [session.status, userId]);
  const scopeKey = scope?.key ?? null;
  const messages = useSyncExternalStore(subscribeChat, () => readChatSnapshot(scope), serverSnapshot);
  const [draft, setDraft] = useState(() => seedQuestion(initialQuery, initialTicker, copy.seed));
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  /** Cambia con la identidad: invalida respuestas y fotos que lleguen tarde. */
  const epoch = useRef(0);
  const lastIdentity = useRef<string | null | undefined>(undefined);
  const hadIdentity = useRef(false);
  /** Última identidad pintada; cubre la ventana entre render y layout effect. */
  const scopeKeyRef = useRef<string | null>(scopeKey);
  scopeKeyRef.current = scopeKey;
  const lastRef = useRef<{
    path: ReturnType<typeof endpointFor>;
    body: ReturnType<typeof buildAiRequest>;
    scopeKey: string | null;
  } | null>(null);

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
    lastRef.current = null;
    setTyping(false);
    setPhotoError(null);
    setAnnouncement("");
    setPendingImage(null);
    setDraft("");
  }, [scopeKey]);

  function publish(activeScope: ChatScope | null, activeEpoch: number, next: readonly ChatMessage[]): boolean {
    if (epoch.current !== activeEpoch) return false;
    if (scopeKeyRef.current !== (activeScope?.key ?? null)) return false;
    if (!publishChatSnapshot(activeScope, next)) return false;
    emitHistory();
    return true;
  }

  useEffect(() => {
    const onCommand = (event: Event) => {
      const custom = event as CustomEvent<
        | { type: "clear" }
        | { type: "attach" }
        | { type: "prompt"; id: AsistenteSuggestionId | "tesla" | "photo"; text: string }
      >;
      const detail = custom.detail;
      if (!detail) return;
      if (detail.type === "clear") {
        if (busy.current) return;
        lastRef.current = null;
        resetChatSnapshot(scope);
        emitHistory();
        setDraft("");
        setPendingImage(null);
        setPhotoError(null);
        setAnnouncement("");
      } else if (detail.type === "attach") {
        fileRef.current?.click();
      } else if (detail.type === "prompt") {
        if (detail.id === "import" || detail.id === "photo") {
          fileRef.current?.click();
        } else {
          void send(detail.text, null);
        }
      }
    };
    window.addEventListener("mv-ai-command", onCommand);
    return () => window.removeEventListener("mv-ai-command", onCommand);
  });

  async function run(
    path: ReturnType<typeof endpointFor>,
    body: ReturnType<typeof buildAiRequest>,
    activeScope: ChatScope | null,
    activeEpoch: number,
  ) {
    busy.current = true;
    setTyping(true);
    lastRef.current = { path, body, scopeKey: activeScope?.key ?? null };
    const result = await postAssistant(path, body);
    // La identidad cambió mientras esperábamos: la respuesta es de otra sesión.
    if (epoch.current !== activeEpoch || scopeKeyRef.current !== (activeScope?.key ?? null)) return;
    const labels = {
      ready: copy.ready,
      compare: copy.compareTitle,
      portfolio: copy.portfolioTitle,
      buy: copy.buyCta,
      photo: copy.photoCaption,
    };
    const fallback =
      result.ok
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
    const published = publish(activeScope, activeEpoch, [...readChatSnapshot(activeScope), message]);
    busy.current = false;
    if (!alive.current) return;
    setTyping(false);
    if (published) setAnnouncement(announceAssistant(message, labels));
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
    if (!publish(activeScope, activeEpoch, [...readChatSnapshot(activeScope), user])) return;
    if (textOverride == null) setDraft("");
    if (imageOverride === undefined) setPendingImage(null);
    setPhotoError(null);
    const body = buildAiRequest({
      messages: readChatSnapshot(activeScope),
      image: image ?? undefined,
      ticker,
    });
    await run(endpointFor(Boolean(image)), body, activeScope, activeEpoch);
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

  async function retry() {
    const last = lastRef.current;
    if (!last || busy.current) return;
    if (last.scopeKey !== scopeKey) {
      lastRef.current = null;
      return;
    }
    const activeScope = scope;
    const activeEpoch = epoch.current;
    const next = readChatSnapshot(activeScope).slice();
    if (next[next.length - 1]?.notice) next.pop();
    if (!publish(activeScope, activeEpoch, next)) return;
    setAnnouncement("");
    await run(last.path, last.body, activeScope, activeEpoch);
  }

  function clear() {
    if (busy.current) return;
    lastRef.current = null;
    resetChatSnapshot(scope);
    emitHistory();
    setDraft("");
    setPendingImage(null);
    setPhotoError(null);
    setAnnouncement("");
  }

  return (
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
      onRetry={() => void retry()}
      onClear={clear}
      fileRef={fileRef}
      backLabel={t.detail.backToMarket}
    />
  );
}
