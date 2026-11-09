"use client";

import { useSyncExternalStore } from "react";

import { readSavedChats, type SavedChatItem } from "@/components/ai/sessions-store";

/**
 * Puente reactivo entre `sessions-store` (localStorage) y la UI.
 * El sidebar y la pantalla del asistente viven en árboles distintos, así que
 * se sincronizan por evento de `window`, igual que el snapshot del chat.
 */
const SESSIONS_EVENT = "maverlang:ai-sessions-changed";
const EMPTY: SavedChatItem[] = [];

let version = 0;
let cache: { key: string; version: number; value: SavedChatItem[] } = { key: "", version: -1, value: EMPTY };
const listeners = new Set<() => void>();

/** Avisa a esta pestaña y a los demás componentes que el historial cambió. */
export function notifySessionsChanged(): void {
  version += 1;
  for (const listener of Array.from(listeners)) listener();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSIONS_EVENT));
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window === "undefined") return () => listeners.delete(onChange);
  window.addEventListener(SESSIONS_EVENT, onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(SESSIONS_EVENT, onChange);
  };
}

/** Snapshot estable: sólo relee del almacenamiento cuando cambió la versión. */
export function readSessionsSnapshot(key: string | null): SavedChatItem[] {
  if (!key) return EMPTY;
  if (cache.key === key && cache.version === version) return cache.value;
  const value = readSavedChats(key);
  cache = { key, version, value };
  return value;
}

function serverSnapshot(): SavedChatItem[] {
  return EMPTY;
}

export function useSavedChats(key: string | null): SavedChatItem[] {
  return useSyncExternalStore(subscribe, () => readSessionsSnapshot(key), serverSnapshot);
}
