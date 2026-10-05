"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type RevealPhase = "static" | "wait" | "in";

/**
 * Reveal al entrar en vista.
 * Parte en `static` (visible en SSR y sin JS). Antes del primer paint, si hay
 * motion, oculta lo que está fuera de vista y anima al intersectar.
 * `prefers-reduced-motion: reduce` lo deja estático.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<RevealPhase>("static");

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    const show = () => {
      if (cancelled || media.matches) return;
      setPhase("in");
      observer?.disconnect();
    };

    const arm = () => {
      observer?.disconnect();
      observer = null;
      if (media.matches) {
        setPhase("static");
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) show();
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
      );
      observer.observe(node);

      const rect = node.getBoundingClientRect();
      const height = window.innerHeight || document.documentElement.clientHeight;
      const inView = rect.bottom > 0 && rect.top < height * 0.92;
      // Si ya se ve, el HTML SSR lo mostró: dejarlo estático evita un parpadeo.
      if (inView) {
        observer.disconnect();
        return;
      }
      setPhase("wait");
    };

    const onFocusIn = () => {
      if (!media.matches) show();
    };

    arm();
    media.addEventListener("change", arm);
    node.addEventListener("focusin", onFocusIn);

    return () => {
      cancelled = true;
      observer?.disconnect();
      media.removeEventListener("change", arm);
      node.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return { ref, phase };
}
