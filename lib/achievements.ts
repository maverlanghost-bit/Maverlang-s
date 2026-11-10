/**
 * Logros y racha educativos (L1) — módulo puro, sin acceso a `window`.
 *
 * No hay premios, dinero ni métricas de inversión: sólo constancia de visita y
 * guías leídas. El estado vive en `localStorage` (`mav:logros:v1`) y lo leen y
 * escriben los componentes cliente; aquí están las reglas y los textos.
 */

export type StreakState = {
  /** Último día visitado, "YYYY-MM-DD" en America/Santiago. */
  lastDay: string | null;
  current: number;
  best: number;
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

/** Estado persistido en `localStorage` bajo `ACHIEVEMENTS_STORAGE_KEY`. */
export type AchievementState = {
  streak: StreakState;
  guides: string[];
};

export const ACHIEVEMENTS_STORAGE_KEY = "mav:logros:v1";
/** Evento local: la tarjeta se refresca cuando una guía se marca como leída. */
export const ACHIEVEMENTS_EVENT = "mav-logros";

const SANTIAGO_TZ = "America/Santiago";
const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_GUIDES = 500;
const MAX_SLUG_LENGTH = 120;

function toCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Número de día UTC para comparar fechas de calendario sin offsets ni DST. */
function dayNumber(day: string | null): number | null {
  if (!day) return null;
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const ms = Date.UTC(year, month - 1, date);
  const parsed = new Date(ms);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) {
    return null;
  }
  return Math.round(ms / DAY_MS);
}

/** Fecha "YYYY-MM-DD" del instante en America/Santiago (hora del producto). */
export function santiagoDay(date: Date = new Date()): string {
  const at = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SANTIAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

export function emptyAchievementState(): AchievementState {
  return { streak: { lastDay: null, current: 0, best: 0 }, guides: [] };
}

/**
 * Lectura defensiva del JSON guardado: cualquier valor inesperado (JSON roto,
 * tipo equivocado, fechas inválidas) cae a un estado vacío o saneado.
 */
export function parseAchievementState(raw: string | null): AchievementState {
  if (!raw) return emptyAchievementState();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyAchievementState();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyAchievementState();
  const record = value as { streak?: unknown; guides?: unknown };

  const streakValue = record.streak;
  const streakRecord =
    streakValue && typeof streakValue === "object" && !Array.isArray(streakValue)
      ? (streakValue as { lastDay?: unknown; current?: unknown; best?: unknown })
      : null;
  const rawLastDay = streakRecord && typeof streakRecord.lastDay === "string" ? streakRecord.lastDay : null;
  const lastDay = dayNumber(rawLastDay) === null ? null : rawLastDay;
  const current = lastDay ? toCount(streakRecord?.current) : 0;
  const best = Math.max(lastDay ? toCount(streakRecord?.best) : 0, current);

  const guides: string[] = [];
  if (Array.isArray(record.guides)) {
    for (const item of record.guides) {
      if (typeof item !== "string") continue;
      const slug = item.trim();
      if (!slug || slug.length > MAX_SLUG_LENGTH || guides.includes(slug)) continue;
      guides.push(slug);
      if (guides.length >= MAX_GUIDES) break;
    }
  }

  return { streak: { lastDay, current, best }, guides };
}

/**
 * Registra la visita del día. Mismo día: igual; día siguiente: +1; cualquier
 * salto (o un `lastDay` ilegible): racha de 1. `best` nunca baja.
 */
export function recordVisit(prev: StreakState, today: string): StreakState {
  const todayNumber = dayNumber(today);
  const lastNumber = dayNumber(prev.lastDay);
  const current = lastNumber === null ? 0 : toCount(prev.current);
  const best = Math.max(toCount(prev.best), current);

  if (todayNumber === null) {
    return { lastDay: lastNumber === null ? null : prev.lastDay, current, best };
  }
  if (lastNumber !== null && lastNumber === todayNumber) return prev;

  const next = lastNumber !== null && todayNumber - lastNumber === 1 ? current + 1 : 1;
  return { lastDay: today, current: next, best: Math.max(best, next) };
}

/** Suma una guía leída sin duplicados; si ya estaba, devuelve el mismo estado. */
export function addGuideRead(state: AchievementState, slug: string): AchievementState {
  const clean = slug.trim();
  if (!clean || clean.length > MAX_SLUG_LENGTH || state.guides.includes(clean)) return state;
  if (state.guides.length >= MAX_GUIDES) return state;
  return { streak: state.streak, guides: [...state.guides, clean] };
}

type AchievementDefinition = { id: string; title: string; description: string };

const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: "primera-visita",
    title: "Primera visita",
    description: "Abriste la plataforma por primera vez. Aquí empieza tu recorrido.",
  },
  {
    id: "racha-3",
    title: "Racha de 3 días",
    description: "Entraste tres días seguidos. La constancia ayuda a aprender.",
  },
  {
    id: "racha-7",
    title: "Racha de 7 días",
    description: "Una semana completa de visitas, a tu ritmo.",
  },
  {
    id: "primera-favorita",
    title: "Primera favorita",
    description: "Guardaste tu primera acción para seguirla con calma.",
  },
  {
    id: "favoritas-5",
    title: "5 favoritas",
    description: "Cinco acciones guardadas para comparar y aprender.",
  },
  {
    id: "primera-guia",
    title: "Leíste tu primera guía",
    description: "Terminaste tu primera guía educativa.",
  },
  {
    id: "guias-3",
    title: "Leíste 3 guías",
    description: "Tres guías leídas: entiendes mejor cómo funciona todo esto.",
  },
];

/**
 * Logros educativos según la racha, las favoritas y las guías leídas. Para la
 * racha se usa el mejor registro (`best`) para no perder lo ya conseguido.
 */
export function computeAchievements(input: {
  streak: StreakState;
  favorites: number;
  guidesRead: number;
}): Achievement[] {
  const visited = dayNumber(input.streak.lastDay) !== null;
  const streakDays = Math.max(toCount(input.streak.current), toCount(input.streak.best));
  const favorites = toCount(input.favorites);
  const guidesRead = toCount(input.guidesRead);

  const unlocked: Record<string, boolean> = {
    "primera-visita": visited,
    "racha-3": streakDays >= 3,
    "racha-7": streakDays >= 7,
    "primera-favorita": favorites >= 1,
    "favoritas-5": favorites >= 5,
    "primera-guia": guidesRead >= 1,
    "guias-3": guidesRead >= 3,
  };

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: unlocked[achievement.id] === true,
  }));
}
