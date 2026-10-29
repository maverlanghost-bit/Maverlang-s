"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";

import { postAssistant } from "@/components/ai/api";
import { ChatView } from "@/components/ai/chat-view";
import { ImagePrepError, compressImageFile } from "@/components/ai/image";
import {
  announceAssistant,
  browserStore,
  buildAiRequest,
  clearChatHistory,
  cleanTicker,
  createId,
  endpointFor,
  readChatHistory,
  seedQuestion,
  writeChatHistory,
  MAX_TEXT,
  type ChatMessage,
} from "@/components/ai/model";
import { asistenteText, type AsistenteSuggestionId } from "@/content/i18n/extra-asistente";
import { useT } from "@/lib/hooks/use-t";

const EMPTY: ChatMessage[] = [];
const HISTORY_EVENT = "mv-ai-chat";

let hydrated = false;
let current: ChatMessage[] = EMPTY;

function emitHistory() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

function subscribeChat(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(HISTORY_EVENT, onChange);
  return () => window.removeEventListener(HISTORY_EVENT, onChange);
}

/** Primera lectura: sessionStorage. Después, la memoria de esta pestaña (conserva las fotos). */
function readSnapshot(): ChatMessage[] {
  if (!hydrated) {
    hydrated = true;
    const history = readChatHistory(browserStore());
    current = history.length === 0 ? EMPTY : history;
  }
  return current;
}

function serverSnapshot(): ChatMessage[] {
  return EMPTY;
}

function publishChat(messages: readonly ChatMessage[]) {
  const next = messages.length === 0 ? EMPTY : messages.slice();
  hydrated = true;
  current = next;
  writeChatHistory(browserStore(), next);
  emitHistory();
}

function resetChat() {
  hydrated = true;
  current = EMPTY;
  clearChatHistory(browserStore());
  emitHistory();
}

export function AsistenteScreen({
  initialQuery,
  initialTicker,
}: {
  initialQuery: string;
  initialTicker: string;
}) {
  const { language } = useT();
  const copy = asistenteText(language);
  const ticker = cleanTicker(initialTicker);
  const messages = useSyncExternalStore(subscribeChat, readSnapshot, serverSnapshot);
  const [draft, setDraft] = useState(() => seedQuestion(initialQuery, initialTicker, copy.seed));
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const lastRef = useRef<{ path: ReturnType<typeof endpointFor>; body: ReturnType<typeof buildAiRequest> } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function run(path: ReturnType<typeof endpointFor>, body: ReturnType<typeof buildAiRequest>) {
    busy.current = true;
    setTyping(true);
    lastRef.current = { path, body };
    const result = await postAssistant(path, body);
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
    publishChat([...readSnapshot(), message]);
    busy.current = false;
    if (!alive.current) return;
    setTyping(false);
    setAnnouncement(announceAssistant(message, labels));
  }

  async function send(textOverride?: string, imageOverride?: string | null) {
    if (busy.current) return;
    const image = imageOverride === undefined ? pendingImage : imageOverride;
    const raw = (textOverride ?? draft).trim();
    const text = (raw || (image ? copy.photoCaption : "")).slice(0, MAX_TEXT);
    if (!text) return;
    const user: ChatMessage = { id: createId(), role: "user", text };
    if (image) user.imageDataUrl = image;
    publishChat([...readSnapshot(), user]);
    if (textOverride == null) setDraft("");
    if (imageOverride === undefined) setPendingImage(null);
    setPhotoError(null);
    const body = buildAiRequest({
      messages: readSnapshot(),
      image: image ?? undefined,
      ticker,
    });
    await run(endpointFor(Boolean(image)), body);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      if (!alive.current) return;
      setPendingImage(dataUrl);
      setPhotoError(null);
    } catch (error) {
      if (!alive.current) return;
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
    const next = readSnapshot().slice();
    if (next[next.length - 1]?.notice) next.pop();
    setAnnouncement("");
    publishChat(next);
    await run(last.path, last.body);
  }

  function clear() {
    if (busy.current) return;
    lastRef.current = null;
    resetChat();
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
    />
  );
}
