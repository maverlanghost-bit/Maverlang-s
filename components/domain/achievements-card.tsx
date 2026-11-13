"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconCheck } from "@/components/ui/icons";
import {
  ACHIEVEMENTS_EVENT,
  ACHIEVEMENTS_STORAGE_KEY,
  computeAchievements,
  emptyAchievementState,
  parseAchievementState,
  recordVisit,
  santiagoDay,
  type AchievementState,
} from "@/lib/achievements";
import { cn } from "@/lib/cn";
import { useFavorites } from "@/lib/hooks/use-favorites";

const SERVER_STATE = emptyAchievementState();

let cachedRaw: string | null | undefined;
let cachedState: AchievementState = SERVER_STATE;

/** Lectura defensiva y estable: mismo objeto mientras el JSON guardado no cambie. */
function readState(): AchievementState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (cachedRaw !== undefined && raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  cachedState = raw === null ? SERVER_STATE : parseAchievementState(raw);
  return cachedState;
}

function serverState(): AchievementState {
  return SERVER_STATE;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ACHIEVEMENTS_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(ACHIEVEMENTS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ACHIEVEMENTS_EVENT, onChange);
  };
}

/** Registra la visita de hoy (hora de Santiago) sin usar estado de React. */
function recordTodayVisit() {
  try {
    const stored = parseAchievementState(window.localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY));
    const streak = recordVisit(stored.streak, santiagoDay());
    if (streak === stored.streak) return;
    window.localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify({ streak, guides: stored.guides }));
    window.dispatchEvent(new Event(ACHIEVEMENTS_EVENT));
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): el perfil sigue funcionando.
  }
}

function dayLabel(days: number): string {
  return days === 1 ? "día" : "días";
}

/**
 * Logros y racha educativos del perfil. Registra la visita del día con la hora
 * de Santiago y las favoritas locales; no toca saldo ni posiciones.
 */
export function AchievementsCard() {
  const { symbols } = useFavorites();
  const favorites = symbols?.length ?? 0;
  const state = useSyncExternalStore(subscribe, readState, serverState);

  useEffect(() => {
    recordTodayVisit();
  }, []);

  const achievements = computeAchievements({
    streak: state.streak,
    favorites,
    guidesRead: state.guides.length,
  });
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;
  const streakDays = state.streak.current;
  const bestDays = state.streak.best;

  return (
    <Card className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-fg">Logros de aprendizaje</h2>
          <p className="mt-1 text-balance text-sm leading-5 text-fg-muted">
            Tu racha de visitas y las guías que ya leíste. Se guardan en este dispositivo.
          </p>
        </div>
        <Badge tone={unlockedCount > 0 ? "up" : "neutral"}>
          {unlockedCount} de {achievements.length}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2/60 px-3 py-2.5">
          <dt className="text-xs font-medium leading-4 tracking-tight text-fg-muted">Racha actual</dt>
          <dd className="mt-0.5 text-sm leading-5 text-fg">
            <span className="font-mono text-lg tabular-nums">{streakDays}</span>{" "}
            <span className="text-fg-muted">{dayLabel(streakDays)}</span>
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2/60 px-3 py-2.5">
          <dt className="text-xs font-medium leading-4 tracking-tight text-fg-muted">Mejor racha</dt>
          <dd className="mt-0.5 text-sm leading-5 text-fg">
            <span className="font-mono text-lg tabular-nums">{bestDays}</span>{" "}
            <span className="text-fg-muted">{dayLabel(bestDays)}</span>
          </dd>
        </div>
      </dl>

      <ul className="grid gap-2 sm:grid-cols-2">
        {achievements.map((achievement) => (
          <li
            key={achievement.id}
            className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface-1 px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                achievement.unlocked ? "bg-up-bg text-up" : "bg-surface-2 text-fg-subtle",
              )}
            >
              {achievement.unlocked ? (
                <IconCheck className="size-3" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", achievement.unlocked ? "text-fg" : "text-fg-muted")}>
                {achievement.title}
                <span className="sr-only">{achievement.unlocked ? " — desbloqueado" : " — pendiente"}</span>
              </p>
              <p className="mt-0.5 text-xs leading-5 text-fg-muted">{achievement.description}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
        <p className="max-w-prose text-xs leading-5 text-fg-muted">
          Los logros son para aprender; no son premios ni dinero y no dependen de ganar o perder.
        </p>
        <Link
          href="/guias"
          className="inline-flex min-h-11 items-center rounded-md text-xs font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Ver guías educativas →
        </Link>
      </div>
    </Card>
  );
}
