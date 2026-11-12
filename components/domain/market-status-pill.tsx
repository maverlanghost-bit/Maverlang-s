"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";

type Language = "es-CL" | "en";
type Session = "regular" | "offHours" | "closed";

const COPY = {
  "es-CL": {
    open: "Abierto",
    after: "Horario nocturno",
    closed: "Cerrado",
    titleOpen: "Bolsa de EE.UU. abierta",
    titleAfter: "Fuera del horario regular",
    titleClosed: "Bolsa de EE.UU. cerrada",
    hours: "Horario regular NY: 09:30–16:00 ET",
    closeToday: "Cierre regular hoy:",
    closeNext: "Próximo cierre regular:",
    openNext: "Próxima apertura regular:",
    zone: "(hora de Chile)",
    footnote: "Operación 24/7 en Solana · Fuera del horario regular de EE.UU. el precio puede variar más.",
    toggleOpen: "Mercado abierto. Ver horario",
    toggleAfter: "Horario nocturno. Ver cuándo abre la bolsa",
    toggleClosed: "Mercado cerrado. Ver cuándo abre la bolsa",
    dismiss: "Cerrar horario del mercado",
  },
  en: {
    open: "Open",
    after: "After hours",
    closed: "Closed",
    titleOpen: "U.S. market open",
    titleAfter: "Outside regular hours",
    titleClosed: "U.S. market closed",
    hours: "Regular NY hours: 09:30–16:00 ET",
    closeToday: "Regular close today:",
    closeNext: "Next regular close:",
    openNext: "Next regular open:",
    zone: "(Chile time)",
    footnote: "Trade 24/7 on Solana · Outside regular U.S. hours the price can move more.",
    toggleOpen: "Market open. Show hours",
    toggleAfter: "After hours. Show when the market opens",
    toggleClosed: "Market closed. Show when the market opens",
    dismiss: "Close market hours",
  },
} as const;

/** Estado general o por acción. `halted` usa tono de error. El texto lo pone quien llama. */
export function MarketStatusPill({
  open,
  label,
  halted = false,
}: {
  open: boolean;
  label: string;
  halted?: boolean;
}) {
  const tone: BadgeTone = halted ? "down" : open ? "up" : "neutral";
  return (
    <Badge
      tone={tone}
      className="max-w-full rounded-full px-3 py-1 text-left text-[13px] font-medium leading-snug whitespace-normal"
    >
      {halted ? null : open ? (
        <SunIcon className="size-3.5 shrink-0 text-amber-500" />
      ) : (
        <MoonIcon className="size-3.5 shrink-0 text-info" />
      )}
      {label}
    </Badge>
  );
}

function santiagoDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function nextChangeLine(nextChange: string | null | undefined, session: Session, language: Language): string | null {
  if (!nextChange) return null;
  const date = new Date(nextChange);
  if (Number.isNaN(date.getTime())) return null;
  const locale = language === "en" ? "en-US" : "es-CL";
  const clock: Intl.DateTimeFormatOptions = {
    timeZone: "America/Santiago",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  const formatted = new Intl.DateTimeFormat(locale, clock).format(date);
  const copy = COPY[language];
  if (session === "regular") {
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: "America/Santiago",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
    const sameDay = santiagoDay(date) === santiagoDay(new Date());
    const prefix = sameDay ? copy.closeToday : copy.closeNext;
    const when = sameDay ? time : formatted;
    return `${prefix} ${when} ${copy.zone}`;
  }
  return `${copy.openNext} ${formatted} ${copy.zone}`;
}

export function FloatingMarketOrb({
  session,
  nextChange,
  language = "es-CL",
}: {
  session: Session;
  nextChange?: string | null;
  language?: Language;
}) {
  const copy = COPY[language];
  const open = session === "regular";
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();
  const schedule = nextChangeLine(nextChange, session, language);
  const title = open ? copy.titleOpen : session === "offHours" ? copy.titleAfter : copy.titleClosed;
  const short = open ? copy.open : session === "offHours" ? copy.after : copy.closed;
  const toggleLabel = open ? copy.toggleOpen : session === "offHours" ? copy.toggleAfter : copy.toggleClosed;

  useEffect(() => {
    if (!shown) return;
    function onPointer(event: PointerEvent) {
      const node = rootRef.current;
      if (!node || node.contains(event.target as Node)) return;
      setShown(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShown(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  return (
    <div
      ref={rootRef}
      className="fixed right-4 bottom-[calc(var(--app-tabs-height,0px)+0.875rem)] z-30 flex flex-col items-end lg:right-6 lg:bottom-6"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={shown}
        aria-controls={shown ? panelId : undefined}
        aria-label={toggleLabel}
        title={short}
        onClick={() => setShown((value) => !value)}
        className="order-2 inline-flex size-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border-control bg-bg/90 p-0 text-sm font-medium text-fg backdrop-blur-md transition-colors duration-200 ease-spring hover:bg-surface-1 active:scale-[0.97] sm:size-auto sm:min-h-11 sm:px-3.5 sm:py-2"
      >
        {open ? <SunIcon className="size-4 text-fg" /> : <MoonIcon className="size-4 text-info" />}
        <span className="hidden sm:inline">{short}</span>
        <span className="hidden sm:inline-flex">{open ? <LiveDot /> : <TwilightDot />}</span>
      </button>
      {shown ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          tabIndex={-1}
          aria-labelledby={titleId}
          className="order-1 mb-2.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-bg/95 p-4 shadow-float ring-1 ring-border backdrop-blur-xl motion-safe:animate-pop-in sm:w-80"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-1">
              {open ? <SunIcon className="size-5 text-fg" /> : <MoonIcon className="size-5 text-info" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p id={titleId} className="text-sm font-semibold tracking-tight text-fg">
                {title}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">{short}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShown(false);
                buttonRef.current?.focus();
              }}
              aria-label={copy.dismiss}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors duration-150 ease-spring hover:bg-surface-2 hover:text-fg sm:size-8"
            >
              <CloseIcon />
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg-body">{copy.hours}</p>
          {schedule ? <p className="mt-1.5 text-sm leading-relaxed text-fg">{schedule}</p> : null}
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">{copy.footnote}</p>
        </div>
      ) : null}
    </div>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M12 2.2v2.15M12 19.65v2.15M4.15 4.15l1.52 1.52M18.33 18.33l1.52 1.52M2.2 12h2.15M19.65 12h2.15M4.15 19.85l1.52-1.52M18.33 5.67l1.52 1.52"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.55" fill="currentColor" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M15.7 14.35A6.15 6.15 0 0 1 9.55 3.85 6.55 6.55 0 1 0 15.7 14.35Z" />
      <path d="M17.15 3.15l.38 1.02 1.02.38-1.02.38-.38 1.02-.38-1.02-1.02-.38 1.02-.38.38-1.02Z" />
      <circle cx="19.55" cy="7.7" r="0.72" />
    </svg>
  );
}

function LiveDot() {
  return <span aria-hidden="true" className="size-2 rounded-full bg-up" />;
}

function TwilightDot() {
  return <span aria-hidden="true" className="size-2 rounded-full bg-info" />;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}
