import type { MarketStatus } from "@/lib/types";

/**
 * Horario del subyacente en America/New_York.
 * `regular`: lun–vie 09:30–16:00. `offHours`: lun–vie fuera de ese rango.
 * `closed`: sábado y domingo. No modela feriados.
 */
const NY = "America/New_York";
const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type Civil = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

function civilParts(instant: Date): Civil {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag = new Map<string, string>();
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") bag.set(part.type, part.value);
  }
  let hour = Number(bag.get("hour"));
  if (hour === 24) hour = 0;
  const weekdayToken = bag.get("weekday") ?? "Sun";
  return {
    year: Number(bag.get("year")),
    month: Number(bag.get("month")),
    day: Number(bag.get("day")),
    hour,
    minute: Number(bag.get("minute")),
    weekday: WEEKDAY[weekdayToken] ?? 0,
  };
}

function offsetMinutes(instant: Date): number {
  const parts = civilParts(instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

function civilToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adjusted = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes(new Date(utc)) * 60_000;
    if (adjusted === utc) break;
    utc = adjusted;
  }
  return new Date(utc);
}

function nextWeekdayOpen(year: number, month: number, day: number): Date {
  const start = Date.UTC(year, month - 1, day);
  for (let add = 1; add <= 7; add += 1) {
    const cursor = new Date(start + add * 86_400_000);
    const weekday = cursor.getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      return civilToUtc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), 9, 30);
    }
  }
  return civilToUtc(year, month, day, 9, 30);
}

export function mockMarketStatus(now = new Date()): MarketStatus {
  const parts = civilParts(now);
  const minutes = parts.hour * 60 + parts.minute;
  const isWeekday = parts.weekday >= 1 && parts.weekday <= 5;
  const underlyingOpen = isWeekday && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
  const session = underlyingOpen ? "regular" : isWeekday ? "offHours" : "closed";

  let nextChange: Date;
  if (underlyingOpen) {
    nextChange = civilToUtc(parts.year, parts.month, parts.day, 16, 0);
  } else if (isWeekday && minutes < OPEN_MINUTES) {
    nextChange = civilToUtc(parts.year, parts.month, parts.day, 9, 30);
  } else {
    nextChange = nextWeekdayOpen(parts.year, parts.month, parts.day);
  }

  return {
    underlyingOpen,
    session,
    nextChange: nextChange.toISOString(),
    note:
      session === "regular"
        ? "Horario regular del mercado de EE.UU."
        : session === "closed"
          ? "El fin de semana el mercado está cerrado. El precio puede moverse al reabrir, el lunes."
          : "Fuera del horario regular. El precio puede variar más.",
  };
}
