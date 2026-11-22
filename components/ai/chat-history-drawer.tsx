"use client";

import { useEffect, useMemo, useState } from "react";

import { readChatSnapshot, resolveChatScope, type ChatMessage } from "@/components/ai/model";
import { NavChatsHistory } from "@/components/ai/nav-chats";
import { useSavedChats } from "@/components/ai/sessions-live";
import type { SavedChatItem } from "@/components/ai/sessions-store";
import { IconPanel } from "@/components/ui/icons";
import { OverlayPanel } from "@/components/ui/overlay";
import { useSession } from "@/lib/auth/session-context";
import { useT } from "@/lib/hooks/use-t";

/** Mismos eventos que usa el sidebar de escritorio: la pantalla es dueña del store. */
const SELECT_EVENT = "maverlang:ai-select-chat";
const ACTION_EVENT = "maverlang:ai-chat-action";

const ROW =
  "flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-fg-body transition-colors hover:bg-fg/[0.055] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

function dispatch(name: string, detail: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Misma conversación activa que calcula la pantalla (primer mensaje + largo). */
function matchChatId(chats: readonly SavedChatItem[], messages: readonly ChatMessage[]): string | null {
  if (messages.length === 0) return null;
  const first = messages.find((item) => item.role === "user")?.text ?? "";
  const match = chats.find(
    (chat) =>
      chat.messages.length === messages.length &&
      (chat.messages.find((item) => item.role === "user")?.text ?? "") === first,
  );
  return match?.id ?? null;
}

function PlusSquareIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 shrink-0 text-fg-muted" aria-hidden>
      <path d="M8.6 3H4.9A1.9 1.9 0 0 0 3 4.9v6.2A1.9 1.9 0 0 0 4.9 13h6.2a1.9 1.9 0 0 0 1.9-1.9V7.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.6 2.5a1.32 1.32 0 0 1 1.9 1.9L8.4 9.5l-2.3.4.4-2.3 5.1-5.1Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 shrink-0 text-fg-muted" aria-hidden>
      <circle cx="7" cy="7" r="4.1" />
      <path d="m10.2 10.2 3.1 3.1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Celular: botón circular que abre el historial de conversaciones como panel
 * lateral. En escritorio la barra lateral ya lo muestra, así que se oculta.
 */
export function ChatHistoryButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { language } = useT();
  const en = language === "en";
  const session = useSession();
  const userId = session.user?.id ?? null;
  const scope = useMemo(() => resolveChatScope(session.status, userId), [session.status, userId]);
  const scopeKey = scope?.key ?? null;
  const chats = useSavedChats(scopeKey);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const messages = scope ? readChatSnapshot(scope) : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el snapshot externo al abrir
    setActiveChatId(matchChatId(chats, messages));
  }, [open, scope, chats]);

  const label = en ? "Open chats" : "Abrir conversaciones";
  const newChatLabel = en ? "New chat" : "Nuevo chat";
  const searchLabel = en ? "Search chats" : "Buscar en chats";

  function close() {
    setOpen(false);
  }

  function newChat() {
    close();
    dispatch("mv-ai-command", { type: "clear" });
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={
          "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-control/70 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 lg:hidden motion-reduce:transition-none" +
          (className ? ` ${className}` : "")
        }
      >
        <IconPanel className="size-4" />
      </button>

      <OverlayPanel
        open={open}
        onClose={close}
        title={en ? "Chats" : "Conversaciones"}
        frameClassName="lg:hidden"
        panelClassName="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-bg p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-float [&>h2]:shrink-0 [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-y-auto"
      >
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={newChat} className={ROW}>
            <PlusSquareIcon />
            <span className="min-w-0 flex-1 truncate">{newChatLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              dispatch(ACTION_EVENT, { type: "search" });
            }}
            className={ROW}
          >
            <SearchGlyph />
            <span className="min-w-0 flex-1 truncate">{searchLabel}</span>
          </button>
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <NavChatsHistory
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={(chatId) => {
              close();
              dispatch(SELECT_EVENT, { chatId });
            }}
            onNewChat={newChat}
            onRenameChat={(chatId, title) => dispatch(ACTION_EVENT, { type: "rename", chatId, title })}
            onTogglePinChat={(chatId) => dispatch(ACTION_EVENT, { type: "pin", chatId })}
            onDeleteChat={(chatId) => dispatch(ACTION_EVENT, { type: "delete", chatId })}
            onShareChat={(chatId) => {
              close();
              dispatch(ACTION_EVENT, { type: "share", chatId });
            }}
          />
        </div>
      </OverlayPanel>
    </>
  );
}
