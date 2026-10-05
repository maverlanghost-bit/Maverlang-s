const SANTIAGO = "America/Santiago";

export type DayGroup<T> = {
  key: string;
  label: string;
  rows: T[];
};

function dayKey(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/** Un día de calendario en Santiago, sin cruzar el cambio de hora. */
function shiftKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days, 16, 0, 0));
  return dayKey(utc.toISOString()) ?? key;
}

/** De la más nueva a la más vieja. `now` define hoy y ayer en America/Santiago. */
export function groupBySantiagoDay<T extends { at: string }>(
  rows: readonly T[],
  now: number,
  labels: { today: string; yesterday: string },
  formatDay: (iso: string) => string,
): DayGroup<T>[] {
  const sorted = [...rows].sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0));
  const today = dayKey(new Date(now).toISOString());
  const yesterday = today ? shiftKey(today, -1) : null;
  const groups: DayGroup<T>[] = [];
  let current: DayGroup<T> | null = null;

  for (const row of sorted) {
    const key = dayKey(row.at) ?? "unknown";
    if (!current || current.key !== key) {
      let label = formatDay(row.at);
      if (today !== null && key === today) label = labels.today;
      else if (yesterday !== null && key === yesterday) label = labels.yesterday;
      current = { key, label, rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }

  return groups;
}
