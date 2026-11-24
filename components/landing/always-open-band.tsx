"use client";

import { useEffect, useState } from "react";

import { Reveal } from "@/components/landing/reveal";
import { LandingSection } from "@/components/landing/section";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/**
 * Banda negra de la portada (la única invertida). Una sola cinta: la semana de
 * 168 h en hora de Chile, con la sesión regular de la bolsa (9:30 a 16:00 de
 * Nueva York) frente al mercado on-chain. Horas y marcador se calculan en el
 * navegador con Intl; antes de hidratar el texto es neutro. Sin feriados.
 */

const OPEN_NY = 9.5;
const CLOSE_NY = 16;
const SESSION_H = CLOSE_NY - OPEN_NY;
const WEEK_BOLSA_H = SESSION_H * 5;
const WEEK_H = 7 * 24;
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FALLBACK_SESSION = { start: 10.5, end: 17 };

const nf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const BOLSA_HOURS = nf.format(WEEK_BOLSA_H);
const WEEK_HOURS = nf.format(WEEK_H);

type Clock = { weekday: number; hours: number };
type Snapshot = {
  /** Sesión regular de hoy, en horas decimales de Chile. */
  session: { start: number; end: number };
  chile: Clock;
  inSession: boolean;
};

function clockIn(timeZone: string, date: Date): Clock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const weekday = WEEKDAYS.indexOf(get("weekday"));
  return { weekday: weekday < 0 ? 0 : weekday, hours: Number(get("hour")) + Number(get("minute")) / 60 };
}

/** Desfase (horas) de una zona respecto de UTC en un instante dado. */
function offsetHours(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 3_600_000;
}

function snapshot(now = new Date()): Snapshot {
  const ny = clockIn("America/New_York", now);
  const chile = clockIn("America/Santiago", now);
  // Mismo instante: la diferencia entre ambas zonas lleva 9:30 y 16:00 de NY a Chile.
  const diff = offsetHours("America/Santiago", now) - offsetHours("America/New_York", now);
  return {
    session: { start: OPEN_NY + diff, end: CLOSE_NY + diff },
    chile,
    inSession: ny.weekday < 5 && ny.hours >= OPEN_NY && ny.hours < CLOSE_NY,
  };
}

function useSnapshot(): Snapshot | null {
  const [state, setState] = useState<Snapshot | null>(null);
  useEffect(() => {
    const tick = () => setState(snapshot());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return state;
}

function hhmm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const dayPct = (hours: number) => `${(hours / 24) * 100}%`;

export function AlwaysOpenBand() {
  const snap = useSnapshot();
  const session = snap?.session ?? FALLBACK_SESSION;
  const scheduleText = snap
    ? `La bolsa de EE.UU. abre de ${hhmm(session.start)} a ${hhmm(session.end)}, hora de Chile.`
    : "Horario de la bolsa de EE.UU. en hora de Chile.";
  const nowWeek = snap ? snap.chile.weekday * 24 + snap.chile.hours : null;
  const nowLabel = snap ? `${DAYS[snap.chile.weekday]} ${hhmm(snap.chile.hours)}` : "";
  const bolsaStatus = snap ? (snap.inSession ? "Ahora: en sesión regular (salvo feriados)" : "Ahora: fuera de la sesión regular") : " ";

  const ariaLabel =
    `Semana de 168 horas, en hora de Chile. La sesión regular de la bolsa de EE.UU. suma ${BOLSA_HOURS} horas, ` +
    `de lunes a viernes, sin contar feriados. ${site.name} on-chain está disponible las ${WEEK_HOURS} horas, todos los días.`;

  return (
    <LandingSection id="horario" titleId="horario-title" tone="inverse">
      <Reveal>
        <h2 id="horario-title" className="text-title text-white">
          <span className="block">La bolsa descansa.</span>
          <span className="block text-inverse-muted">Esto sigue disponible.</span>
        </h2>
        <p className="mt-5 max-w-[36rem] text-pretty text-lead text-inverse-muted">
          Los tokens se compran y venden on-chain a cualquier hora, también de noche y el fin de semana. Fuera del
          horario regular de la bolsa de EE.UU. hay menos liquidez y el precio puede variar más.
        </p>
      </Reveal>

      <Reveal delay={80} className="mt-12 sm:mt-14">
        <div className="rounded-[28px] border border-inverse-border bg-inverse-surface p-5 sm:p-8">
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
            <Figure value={BOLSA_HOURS} title="Bolsa de EE.UU., por semana" note="Sesión regular, sin contar feriados" muted />
            <Figure value={WEEK_HOURS} title={`${site.name}, on-chain`} note="Todos los días, a cualquier hora" />
          </div>

          <p className="mt-8 text-sm text-inverse-muted" aria-live="off">
            {scheduleText}
          </p>

          <div role="img" aria-label={ariaLabel} className="mt-6">
            {/* Escritorio: cinta de 168 h, una fila por pista. */}
            <div className="hidden sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:grid-rows-[auto_auto_auto_auto] sm:gap-y-3">
              <div aria-hidden className="pointer-events-none relative col-start-2 row-span-4 row-start-1">
                {nowWeek !== null ? (
                  <>
                    <span
                      className={cn(
                        "tabular-nums absolute top-0 whitespace-nowrap text-sm font-medium text-white",
                        nowWeek / WEEK_H > 0.8 ? "-translate-x-full pr-2" : "pl-2",
                      )}
                      style={{ left: `${(nowWeek / WEEK_H) * 100}%` }}
                    >
                      Ahora, {nowLabel}
                    </span>
                    <span
                      className="absolute bottom-7 top-7 w-0.5 -translate-x-1/2 rounded-full bg-up"
                      style={{ left: `${(nowWeek / WEEK_H) * 100}%` }}
                    />
                  </>
                ) : null}
              </div>

              <div className="col-start-1 row-start-2 min-w-0 self-center pr-3">
                <p className="text-sm font-medium text-inverse-muted">Bolsa de EE.UU.</p>
                <p className="tabular-nums text-sm text-inverse-muted">{bolsaStatus.trim() ? bolsaStatus : " "}</p>
              </div>
              <div className="col-start-2 row-start-2 mt-7 grid h-9 grid-cols-7 gap-0.5">
                {DAYS.map((day, index) => (
                  <span key={day} className="relative overflow-hidden rounded-md bg-white/10">
                    {index < 5 ? (
                      <span
                        className="absolute inset-y-0 bg-white/45"
                        style={{ left: dayPct(session.start), width: dayPct(session.end - session.start) }}
                      />
                    ) : null}
                  </span>
                ))}
              </div>

              <div className="col-start-1 row-start-3 min-w-0 self-center pr-3">
                <p className="text-sm font-medium text-white">{site.name}</p>
                <p className="text-sm text-inverse-muted">{snap ? "Ahora: disponible" : "On-chain"}</p>
              </div>
              <div className="col-start-2 row-start-3 grid h-9 grid-cols-7 gap-0.5">
                {DAYS.map((day) => (
                  <span key={day} className="rounded-md bg-white" />
                ))}
              </div>

              <div className="col-start-2 row-start-4 grid grid-cols-7 gap-0.5 text-center text-sm text-inverse-muted">
                {DAYS.map((day, index) => (
                  <span key={day} className={cn(snap?.chile.weekday === index && "font-semibold text-white")}>
                    {day}
                  </span>
                ))}
              </div>
            </div>

            {/* Móvil: una fila por día, con las dos pistas apiladas. */}
            <div aria-hidden className="space-y-3 sm:hidden">
              {DAYS.map((day, index) => {
                const today = snap?.chile.weekday === index;
                return (
                  <div key={day} className="flex items-center gap-3">
                    <span className={cn("w-9 shrink-0 text-sm", today ? "font-semibold text-white" : "text-inverse-muted")}>{day}</span>
                    <div className="relative flex-1 space-y-1">
                      <span className="relative block h-2.5 overflow-hidden rounded-sm bg-white/10">
                        {index < 5 ? (
                          <span
                            className="absolute inset-y-0 bg-white/45"
                            style={{ left: dayPct(session.start), width: dayPct(session.end - session.start) }}
                          />
                        ) : null}
                      </span>
                      <span className="block h-2.5 rounded-sm bg-white" />
                      {today && snap ? (
                        <span
                          className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-up"
                          style={{ left: dayPct(snap.chile.hours) }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <p className="tabular-nums pl-12 text-sm text-inverse-muted">
                Arriba, la bolsa; abajo, on-chain.{nowLabel ? ` Ahora, ${nowLabel}.` : ""}
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm text-inverse-muted sm:hidden">{bolsaStatus.trim() ? bolsaStatus : null}</p>
        </div>
      </Reveal>
    </LandingSection>
  );
}

function Figure({ value, title, note, muted = false }: { value: string; title: string; note: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-sm text-inverse-muted">{title}</p>
      <p className={cn("tabular-nums mt-1 text-5xl font-semibold tracking-tight sm:text-6xl", muted ? "text-inverse-muted" : "text-white")}>
        {value}
        <span className="ml-2 text-2xl font-medium text-inverse-muted">h</span>
      </p>
      <p className="mt-1 text-sm text-inverse-muted">{note}</p>
    </div>
  );
}
