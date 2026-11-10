"use client";

import { useEffect } from "react";

import {
  ACHIEVEMENTS_EVENT,
  ACHIEVEMENTS_STORAGE_KEY,
  addGuideRead,
  parseAchievementState,
} from "@/lib/achievements";

/**
 * Marca la guía como leída en `localStorage` (`mav:logros:v1`). No renderiza
 * nada: vive al final de la página de la guía y alimenta los logros del perfil.
 */
export function GuideReadMarker({ slug }: { slug: string }): null {
  useEffect(() => {
    if (!slug.trim()) return;
    try {
      const stored = parseAchievementState(window.localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY));
      const next = addGuideRead(stored, slug);
      if (next === stored) return;
      window.localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(ACHIEVEMENTS_EVENT));
    } catch {
      // Sin almacenamiento (modo privado o cuota llena): la guía se lee igual.
    }
  }, [slug]);

  return null;
}
