"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/** Elevación (em) y giro (grados) de las tres últimas letras: antepenúltima, penúltima, última. */
const TAIL = [
  { lift: 0.1, rot: -4 },
  { lift: 0.18, rot: 7 },
  { lift: 0.28, rot: -10 },
];

/** Progreso fijo para quien prefiere menos movimiento. */
const REDUCED_P = 0.6;
/** Rango mínimo de scroll (px) sobre el que se reparte el progreso. */
const MIN_RANGE = 240;
/** Fracción de la distancia que se recorre por cuadro hacia el objetivo. */
const LERP = 0.12;
/** Retraso máximo de la primera letra (las últimas empiezan antes). */
const MAX_DELAY = 0.2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (v: number) => 1 - Math.pow(1 - v, 3);

function letterShape(i: number, n: number) {
  const fromEnd = n - 1 - i;
  if (fromEnd < TAIL.length) return TAIL[TAIL.length - 1 - fromEnd]!;
  const t = n > 1 ? i / (n - 1) : 0;
  return { lift: 0.015 + 0.065 * t * t, rot: 0 };
}

/** Avance (0–1) ya suavizado de la letra i para un progreso global p. */
function letterEase(p: number, i: number, n: number) {
  const t = n > 1 ? i / (n - 1) : 1;
  const delay = (1 - t) * MAX_DELAY;
  return easeOutCubic(clamp01((p - delay) / (1 - delay)));
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Nombre de marca gigante. El HTML del servidor ya trae el estado visible (letras en la
 * línea base); sólo el cliente oculta las letras antes de pintar (si la palabra aún no
 * está en pantalla) y las revela con IntersectionObserver.
 * Mientras se baja por el pie, las letras suben ligadas al scroll: --p (0–1) se interpola
 * en rAF y cada letra recibe su avance --e, con más amplitud hacia el final.
 */
export function FooterWordmark({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const letters = Array.from(text);
  const n = letters.length;

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inners = Array.from(el.querySelectorAll<HTMLElement>("[data-wl]"));

    const apply = (p: number) => {
      el.style.setProperty("--p", p.toFixed(4));
      inners.forEach((node, i) => {
        node.style.setProperty("--e", letterEase(p, i, inners.length).toFixed(4));
      });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(REDUCED_P);
      return;
    }

    const rect = el.getBoundingClientRect();
    const visibleNow = rect.top < window.innerHeight * 0.9;
    let io: IntersectionObserver | null = null;
    if (!visibleNow) {
      el.dataset.wm = "hidden";
      io = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            el.dataset.wm = "in";
            io?.disconnect();
          }
        },
        { threshold: 0.25 },
      );
      io.observe(el);
    }

    let cur = 0;
    let target = 0;
    let scrollRaf = 0;
    let loopRaf = 0;

    const measureTarget = () => {
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
      const end = maxScroll;
      const start = Math.min(top - vh, end - MIN_RANGE);
      target = clamp01((window.scrollY - start) / (end - start));
    };

    const tick = () => {
      loopRaf = 0;
      cur += (target - cur) * LERP;
      if (Math.abs(target - cur) < 0.0005) cur = target;
      apply(cur);
      if (cur !== target) loopRaf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!loopRaf) loopRaf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        measureTarget();
        kick();
      });
    };

    measureTarget();
    cur = target;
    apply(cur);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      io?.disconnect();
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (loopRaf) cancelAnimationFrame(loopRaf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="[container-type:inline-size]">
      {/* Relleno superior = elevación máx. 0.28em + ~0.08em por giro; derecho = giro de la última. */}
      <p
        ref={ref}
        className="group/wm overflow-hidden pt-[0.4em] pr-[0.1em] pb-[0.2em] text-[20.5cqi] leading-[0.8] font-semibold tracking-[-0.055em] whitespace-nowrap text-fg select-none"
      >
        <span className="sr-only">{text}</span>
        {letters.map((char, i) => {
          const { lift, rot } = letterShape(i, n);
          return (
            <span
              key={i}
              aria-hidden="true"
              className="inline-block transition-[transform,opacity] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[wm=hidden]/wm:translate-y-[45%] group-data-[wm=hidden]/wm:opacity-0 motion-reduce:transition-none"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <span
                data-wl=""
                className="inline-block will-change-transform"
                style={{
                  transform: `translateY(calc(var(--e, 0) * ${-lift}em)) rotate(calc(var(--e, 0) * ${rot}deg))`,
                }}
              >
                {char}
              </span>
            </span>
          );
        })}
      </p>
    </div>
  );
}
