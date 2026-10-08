/** Lógica pura del panel admin (M57). Sin red ni secret key. */

export const ADMIN_NOTE_MAX = 500;
export const ADMIN_VISIBLE_CAP = 100;

export const ADMIN_AVISO = {
  listo: "listo",
  faltaNota: "falta-nota",
  confirma: "confirma",
  noSePudo: "no-se-pudo",
} as const;

export type AdminAviso = (typeof ADMIN_AVISO)[keyof typeof ADMIN_AVISO];

export type OverrideAction = "force_hide" | "clear_override";

export type AdminAsset = {
  symbol: string;
  name: string;
  safetyStatus: string;
  reasons: string[];
  checkedAt: string | null;
  manualOverride: string | null;
  manualNote: string | null;
};

export type AssetSnapshot = {
  symbol: string;
  safety_status: string | null;
};

export type AssetOverrideStore = {
  find(symbol: string): Promise<AssetSnapshot | null>;
  update(symbol: string, patch: Record<string, unknown>): Promise<boolean>;
  insertEvent(event: Record<string, unknown>): Promise<boolean>;
};

export type OverrideResult = "ok" | "missing" | "nota" | "fallo";

const SYMBOL = /^[A-Za-z0-9.]{1,32}$/;

export function parseAdminSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim();
  if (!SYMBOL.test(symbol)) return null;
  return symbol;
}

export function parseAdminNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.trim();
  if (note.length < 1 || note.length > ADMIN_NOTE_MAX) return null;
  return note;
}

export function firstQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, 64);
}

export function adminHref(q: string, aviso?: string): string {
  const params = new URLSearchParams();
  const query = q.trim().slice(0, 64);
  if (query) params.set("q", query);
  if (aviso) params.set("aviso", aviso);
  const search = params.toString();
  return search ? `/admin?${search}` : "/admin";
}

export function hideUpdate(note: string, nowIso: string): Record<string, unknown> {
  return {
    manual_override: "force_hide",
    manual_note: note,
    safety_status: "hidden",
    hidden_at: nowIso,
  };
}

export function clearOverrideUpdate(note: string): Record<string, unknown> {
  return {
    manual_override: null,
    manual_note: note,
  };
}

export function adminSafetyEvent(input: {
  symbol: string;
  note: string;
  action: OverrideAction;
  statusBefore: string;
  statusAfter: string;
  userId: string;
}): Record<string, unknown> {
  return {
    run_id: null,
    symbol: input.symbol,
    result: input.action === "force_hide" ? "OCULTAR" : "QUITAR_OVERRIDE",
    reasons: [input.note],
    metrics: {
      source: "admin",
      action: input.action,
      note: input.note,
      by: input.userId,
    },
    status_before: input.statusBefore,
    status_after: input.statusAfter,
  };
}

export async function applyOverride(
  store: AssetOverrideStore,
  input: {
    symbol: unknown;
    note: unknown;
    action: OverrideAction;
    userId: string;
    nowIso: string;
  },
): Promise<OverrideResult> {
  const note = parseAdminNote(input.note);
  if (!note) return "nota";
  const symbol = parseAdminSymbol(input.symbol);
  if (!symbol) return "missing";
  const row = await store.find(symbol);
  if (!row) return "missing";
  const before = row.safety_status && row.safety_status.length > 0 ? row.safety_status : "unknown";
  const patch =
    input.action === "force_hide" ? hideUpdate(note, input.nowIso) : clearOverrideUpdate(note);
  const after = input.action === "force_hide" ? "hidden" : before;
  const updated = await store.update(symbol, patch);
  if (!updated) return "fallo";
  const saved = await store.insertEvent(
    adminSafetyEvent({
      symbol,
      note,
      action: input.action,
      statusBefore: before,
      statusAfter: after,
      userId: input.userId,
    }),
  );
  if (!saved) return "fallo";
  return "ok";
}

export function toAdminAsset(row: Record<string, unknown>): AdminAsset | null {
  const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
  if (!symbol) return null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : symbol;
  const reasons = Array.isArray(row.safety_reasons)
    ? row.safety_reasons.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const checked = row.safety_checked_at;
  return {
    symbol,
    name,
    safetyStatus: typeof row.safety_status === "string" ? row.safety_status : "unknown",
    reasons,
    checkedAt: typeof checked === "string" && checked.length > 0 ? checked : null,
    manualOverride: typeof row.manual_override === "string" ? row.manual_override : null,
    manualNote: typeof row.manual_note === "string" && row.manual_note.trim() ? row.manual_note.trim() : null,
  };
}

export function filterAdminAssets(rows: readonly AdminAsset[], query: string): AdminAsset[] {
  const needle = query.trim().toLocaleLowerCase("es-CL");
  if (!needle) return [...rows];
  return rows.filter((row) => {
    return (
      row.symbol.toLocaleLowerCase("es-CL").includes(needle) ||
      row.name.toLocaleLowerCase("es-CL").includes(needle)
    );
  });
}

export function formatReasons(reasons: readonly string[]): string {
  if (reasons.length === 0) return "—";
  const shown = reasons.slice(0, 4);
  const extra = reasons.length > shown.length ? ` +${reasons.length - shown.length}` : "";
  return `${shown.join(" · ")}${extra}`;
}

export function formatAdminDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

export function statusLabel(status: string): string {
  switch (status) {
    case "listed":
      return "Listado";
    case "watch":
      return "En revisión";
    case "hidden":
      return "Oculto";
    default:
      return "Sin estado";
  }
}

export function overrideLabel(override: string | null): string {
  if (override === "force_hide") return "Forzado oculto";
  if (override === "force_list") return "Forzado listado";
  return "Sin override";
}
