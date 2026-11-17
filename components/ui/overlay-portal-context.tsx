"use client";

import { createContext, useContext } from "react";
import { useFullscreenContainer } from "@/lib/hooks/use-fullscreen-container";

const OverlayPortalContext = createContext<{ host: HTMLElement | null; owner: HTMLElement | null } | null>(null);
export const OverlayPortalProvider = OverlayPortalContext.Provider;

/** A floating control belongs to its modal, or to a chart expanded inside it. */
export function useOverlayPortalContainer() {
  const context = useContext(OverlayPortalContext);
  const fullscreen = useFullscreenContainer();
  if (fullscreen && (!context?.owner || context.owner.contains(fullscreen))) return fullscreen;
  return context?.host ?? fullscreen;
}
