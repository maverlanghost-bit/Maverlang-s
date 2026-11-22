"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Reveal } from "@/components/landing/reveal";
import { LandingSection } from "@/components/landing/section";
import { cn } from "@/lib/cn";

/**
 * Banda negra de la portada (T90, la única invertida). Muestra el día en hora
 * de Nueva York: la sesión regular de la bolsa (9:30 a 16:00, lunes a viernes)
 * frente al mercado on-chain, que no cierra. El marcador "ahora" lo calcula el
 * navegador; no afirma "abierto/cerrado" porque no conoce los feriados.
 */

const OPEN_H = 9.5;
const CLOSE_H = 16;
const TICKS = [0, 6, 12, 18, 24] as const;
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

type NyNow = { hours: number; label: string; weekday: number };

function nyNow(): NyNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return {
    hours: hour + minute / 60,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    weekday: weekday < 0 ? 0 : weekday,
  };
}

function useNyNow(): NyNow | null {
  const [now, setNow] = useState<NyNow | null>(null);
  useEffect(() => {
    const tick = () => setNow(nyNow());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const pct = (hours: number) => `${(hours / 24) * 100}%`;

export function AlwaysOpenBand() {
  const now = useNyNow();

  return (
    <LandingSection id="horario" titleId="horario-title" tone="inverse">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
        <Reveal>
          <h2 id="horario-title" className="text-title text-white">
            <span className="block">La bolsa cierra.</span>
            <span className="block text-inverse-muted">Esto sigue abierto.</span>
          </h2>
          <p className="mt-5 max-w-[30rem] text-pretty text-lead text-inverse-muted">
            Los tokens se compran y venden on-chain a cualquier hora, también de noche y el fin de semana. Fuera del
            horario regular de la bolsa de EE.UU. hay menos liquidez y el precio puede variar más.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="rounded-[28px] border border-inverse-border bg-inverse-surface p-5 sm:p-7">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[13px] text-inverse-muted">Un día, en hora de Nueva York</p>
              <p className="num text-[13px] text-white" aria-live="off">
                {now ? (
                  <>
                    <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-up align-middle" />
                    Ahora {now.label}
                  </>
                ) : (
                  " "
                )}
              </p>
            </div>

            <div className="relative mt-5">
              <Track label="Bolsa de EE.UU." sub="9:30 a 16:00" now={now}>
                <span
                  className="absolute inset-y-0 rounded-md bg-white/40"
                  style={{ left: pct(OPEN_H), width: pct(CLOSE_H - OPEN_H) }}
                />
              </Track>
              <Track label="On-chain" sub="24 horas, 7 días" strong now={now}>
                <span className="absolute inset-0 rounded-md bg-white" />
              </Track>

              {/* Escala horaria bajo las pistas; el marcador cruza ambas. */}
              <div className="relative mt-1 h-4 text-[11px] text-inverse-muted sm:ml-[8.5rem]">
                {TICKS.map((tick) => (
                  <span
                    key={tick}
                    className="num absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                    style={{ left: pct(tick) }}
                  >
                    {String(tick).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-inverse-border pt-5">
              <p className="text-[13px] text-inverse-muted">La semana</p>
              <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden>
                {DAYS.map((day, index) => {
                  const weekday = index < 5;
                  const today = now?.weekday === index;
                  return (
                    <div key={day} className="flex flex-col items-center gap-1.5">
                      <span className={cn("text-[11px]", today ? "font-semibold text-white" : "text-inverse-muted")}>{day}</span>
                      <span className="relative h-7 w-full overflow-hidden rounded-md bg-white/10">
                        {weekday ? (
                          <span className="absolute inset-x-0 bg-white/40" style={{ top: pct(OPEN_H), height: pct(CLOSE_H - OPEN_H) }} />
                        ) : null}
                      </span>
                      <span className="h-7 w-full rounded-md bg-white" />
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-inverse-muted">
                Arriba, la sesión regular de la bolsa en cada día. Abajo, on-chain: el día completo.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </LandingSection>
  );
}

function Track({ label, sub, strong = false, now, children }: { label: string; sub: string; strong?: boolean; now: NyNow | null; children: ReactNode }) {
  return (
    <div className="mb-3 grid gap-1.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center sm:gap-0">
      <div className="min-w-0 pr-3">
        <p className={cn("text-[13px] leading-4", strong ? "font-medium text-white" : "text-inverse-muted")}>{label}</p>
        <p className="text-[11px] leading-4 text-inverse-muted">{sub}</p>
      </div>
      <span className="relative h-9 overflow-hidden rounded-md bg-white/10">
        {children}
        {now ? (
          <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-up" style={{ left: pct(now.hours) }} />
        ) : null}
      </span>
    </div>
  );
}
