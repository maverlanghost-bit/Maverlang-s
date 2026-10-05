"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useSession } from "@/lib/auth/session-context";

const HIDE_EVENT = "a24-hide-balance";

function hideKey(userId: string) {
  return `a24_hide_balance:${userId}`;
}

function subscribeHide(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith("a24_hide_balance")) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HIDE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HIDE_EVENT, onChange);
  };
}

function readHidden(key: string | null): boolean | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function hiddenOnServer(): boolean | null {
  return null;
}

/** El mismo interruptor que el saldo del shell (`a24_hide_balance:<userId>`). */
export function useHideBalance() {
  const session = useSession();
  const userId = session.status === "authenticated" ? (session.user?.id ?? null) : null;
  const key = userId ? hideKey(userId) : null;
  const hidden = useSyncExternalStore(subscribeHide, () => readHidden(key), hiddenOnServer);
  const toggle = useCallback(() => {
    if (!key) return;
    const next = readHidden(key) !== true;
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      return;
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
  }, [key]);
  return { hidden, toggle, userId };
}
