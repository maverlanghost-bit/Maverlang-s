"use client";

import { useEffect, useRef, useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { LandingLiveBadge, useLandingQuote } from "@/components/landing/live-landing-prices";
import { cn } from "@/lib/cn";
import { formatShares, formatUsd } from "@/lib/format";
import type { LandingQuote } from "@/lib/mocks/landing";

/**
 * Teléfono del hero (T90): el flujo real de compra de la demo, en bucle.
 *
 *   0 mercado · 1 toque en la acción · 2 sube la hoja · 3 burbuja US$50 · 4 compra realizada
 *
 * Los precios salen de `useLandingQuote` (los mismos de la cinta), así que la
 * cantidad recibida es la cuenta real al precio mostrado. Es un ejemplo y lo
 * dice: no ejecuta nada. Se detiene fuera de vista y con el botón de pausa; con
 * `prefers-reduced-motion` queda fijo en la hoja con el monto elegido.
 */

const STEP_MS = [1700, 900, 1000, 1700, 3000] as const;
const LAST_STEP = STEP_MS.length - 1;
const STATIC_STEP = 3;
const AMOUNT_USD = 50;
const CHIPS = [10, 50, 100] as const;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduced;
}

export function HeroPhoneDemo({
  quotes,
  focus,
  live,
  caption,
}: {
  quotes: LandingQuote[];
  focus: LandingQuote;
  live: boolean;
  /** Aviso de origen de precios armado en el servidor (`landingNotice`). */
  caption: string;
}) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const running = !reduced && !paused && visible;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setStep((current) => {
        if (current < LAST_STEP) return current + 1;
        setCycle((value) => value + 1);
        return 0;
      });
    }, STEP_MS[step]);
    return () => window.clearTimeout(timer);
  }, [running, step]);

  const shown = reduced ? STATIC_STEP : step;
  const focusLive = useLandingQuote(focus.symbol, { priceUsd: focus.priceUsd, change: focus.change });
  const shares = focusLive.priceUsd > 0 ? AMOUNT_USD / focusLive.priceUsd : 0;
  const sheetUp = shown >= 2 && shown < 4;
  const chosen = shown >= 3;

  return (
    <div ref={rootRef} className="flex flex-col items-center">
      {/* El dibujo es decorativo para lectores de pantalla: el resumen va en sr-only. */}
      <p className="sr-only">
        Ejemplo de compra en la demo: eliges {focus.name}, marcas US${AMOUNT_USD} y recibes cerca de{" "}
        {formatShares(shares)} al precio mostrado.
      </p>
      <div aria-hidden className="relative w-[272px] sm:w-[300px]">
        <div className="relative overflow-hidden rounded-[46px] border-[7px] border-fg bg-bg shadow-frame" style={{ aspectRatio: "9 / 18.6" }}>
          <span className="absolute top-2.5 left-1/2 z-30 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-fg" />

          {/* 0-1: mercado */}
          <div className="absolute inset-0 flex flex-col px-3 pt-12">
            <div className="px-2">
              <p className="text-[19px] leading-6 font-semibold tracking-tight text-fg">Mercado</p>
              <div className="mt-1 scale-90 origin-left">
                <LandingLiveBadge live={live} />
              </div>
            </div>
            {/* Saldo de práctica: el mismo monto ficticio que entrega la demo. */}
            <div className="mx-1 mt-3 rounded-2xl bg-fg px-4 py-3 text-bg">
              <p className="text-[11px] leading-4 text-white/70">Saldo demo</p>
              <p className="num text-[22px] leading-7 tracking-tight">US$10.000,00</p>
            </div>
            <ul className="mt-2 flex flex-col gap-0.5">
              {quotes.map((quote) => (
                <PhoneRow
                  key={quote.symbol}
                  quote={quote}
                  active={quote.symbol === focus.symbol && shown >= 1}
                  tap={quote.symbol === focus.symbol && shown === 1}
                />
              ))}
            </ul>
          </div>

          {/* Velo bajo la hoja */}
          <div className={cn("absolute inset-0 z-10 bg-fg/35 transition-opacity duration-500", sheetUp ? "opacity-100" : "opacity-0")} />

          {/* 2-3: hoja de compra */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 rounded-t-[24px] bg-bg px-4 pt-2 pb-5 transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
              sheetUp ? "translate-y-0" : "translate-y-full",
            )}
          >
            <span className="mx-auto block h-1 w-9 rounded-full bg-surface-3" />
            <div className="mt-3 flex items-center gap-2.5">
              <TickerLogo symbol={focus.symbol} name={focus.name} logoUrl={focus.logo} size={30} decorative />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-4 font-medium text-fg">Comprar {focus.name}</p>
                <p className="num text-[11px] leading-4 text-fg-muted">{formatUsd(focusLive.priceUsd)}</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-fg-muted">Monto</p>
            <p className="num mt-0.5 text-[34px] leading-none tracking-tight text-fg">
              US${chosen ? AMOUNT_USD : 0}
            </p>
            <p className={cn("num mt-2 h-4 text-[11px] text-fg-muted transition-opacity duration-300", chosen ? "opacity-100" : "opacity-0")}>
              Recibes ≈ {formatShares(shares)}
            </p>
            <div className="mt-3 flex gap-1.5">
              {CHIPS.map((chip) => (
                <span
                  key={chip}
                  className={cn(
                    "num flex h-7 flex-1 items-center justify-center rounded-full border text-[11px] transition-colors duration-300",
                    chosen && chip === AMOUNT_USD ? "border-fg bg-fg text-bg" : "border-border bg-surface-1 text-fg-body",
                  )}
                >
                  US${chip}
                </span>
              ))}
            </div>
            <span
              className={cn(
                "mt-4 flex h-10 items-center justify-center rounded-full text-[13px] font-medium transition-colors duration-300",
                chosen ? "bg-fg text-bg" : "bg-surface-3 text-fg-muted",
              )}
            >
              Revisar compra
            </span>
          </div>

          {/* 4: compra realizada */}
          <div
            className={cn(
              "absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg px-6 text-center transition-opacity duration-500",
              shown === 4 ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {shown === 4 ? (
              <div key={cycle} className="flex flex-col items-center">
                <span className="relative grid size-16 place-items-center rounded-full bg-up text-white motion-safe:animate-success-pop">
                  <span className="absolute inset-0 rounded-full bg-up motion-safe:animate-success-ring" style={{ animationDelay: "120ms" }} />
                  <svg viewBox="0 0 24 24" className="relative size-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5 9.5 17 19 7.5" pathLength={1} strokeDasharray={1} className="motion-safe:animate-check-draw" style={{ animationDelay: "220ms" }} />
                  </svg>
                </span>
                <p className="mt-4 text-[19px] leading-6 font-semibold tracking-tight text-fg motion-safe:animate-success-text" style={{ animationDelay: "280ms" }}>
                  Compra realizada
                </p>
                <p className="num mt-1 text-[12px] text-fg-muted motion-safe:animate-success-text" style={{ animationDelay: "340ms" }}>
                  {formatShares(shares)} de {focus.name}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[13px] text-fg-muted">
        {reduced ? null : (
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={paused}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-medium text-fg-body transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <span aria-hidden className="grid size-5 place-items-center rounded-full border border-border-strong">
              {paused ? (
                <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor"><path d="M3 2v6l5-3z" /></svg>
              ) : (
                <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor"><path d="M2.5 2h1.8v6H2.5zM5.7 2h1.8v6H5.7z" /></svg>
              )}
            </span>
            {paused ? "Reanudar ejemplo" : "Pausar ejemplo"}
          </button>
        )}
        <span>{caption}</span>
      </div>
    </div>
  );
}

function PhoneRow({ quote, active, tap }: { quote: LandingQuote; active: boolean; tap: boolean }) {
  const live = useLandingQuote(quote.symbol, { priceUsd: quote.priceUsd, change: quote.change });
  return (
    <li className={cn("relative flex items-center gap-2.5 rounded-2xl px-2 py-2 transition-colors duration-300", active ? "bg-surface-2" : "bg-transparent")}>
      <TickerLogo symbol={quote.symbol} name={quote.name} logoUrl={quote.logo} size={32} decorative />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-4 font-medium text-fg">{quote.underlying}</span>
        <span className="block truncate text-[11px] leading-4 text-fg-muted">{quote.name}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="num text-[12px] leading-4 text-fg">{formatUsd(live.priceUsd)}</span>
        <ChangeBadge value={live.change} size="sm" />
      </span>
      {tap ? (
        <span className="pointer-events-none absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inset-0 rounded-full bg-fg/25 motion-safe:animate-success-ring" />
          <span className="absolute inset-2.5 rounded-full bg-fg/30" />
        </span>
      ) : null}
    </li>
  );
}
