"use client";

import { useSyncExternalStore } from "react";

function subscribe(change: () => void) {
  document.addEventListener("fullscreenchange", change);
  return () => document.removeEventListener("fullscreenchange", change);
}
function snapshot() {
  return document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : null;
}
function serverSnapshot() { return null; }

/** Portals must stay within the native fullscreen element to remain visible. */
export function useFullscreenContainer() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
