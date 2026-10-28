/**
 * Activos visibles para los crons de precio. Misma regla que el catálogo
 * (`annotateSafety` + `isVisibleInScope` + una ficha por empresa), sin
 * `server-only`, para que el script local pueda importarla.
 */

export type CronScope = "curated" | "listed" | "all";
export type CronIssuer = "xstocks" | "ondo";
export type CronSafety = "listed" | "watch" | "hidden" | "unknown";

export interface CronAssetInput {
  symbol?: unknown;
  underlying?: unknown;
  mint_solana?: unknown;
  issuer?: unknown;
  company_ticker?: unknown;
  curated?: unknown;
  enabled?: unknown;
  is_trading_halted?: unknown;
  safety_status?: unknown;
  safety_metrics?: unknown;
}

export interface VisiblePriceAsset {
  symbol: string;
  mint: string;
  issuer: CronIssuer;
  companyTicker: string;
}

interface Annotated {
  symbol: string;
  mint: string;
  issuer: CronIssuer;
  companyTicker: string;
  curated: boolean;
  safetyStatus: CronSafety;
  tradable: boolean;
  transitionKept: boolean;
  buy100CostBps: number | null;
}

export interface SelectVisibleOptions {
  scope?: string;
  /** En producción `all` se trata como `listed`, igual que el catálogo. */
  production?: boolean;
  /** false cuando las filas no vienen de Supabase: no hay transición. */
  fromSupabase?: boolean;
  volumeWinners?: ReadonlyMap<string, "xstocks" | "ondo">;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safetyOf(value: unknown): CronSafety {
  return value === "listed" || value === "watch" || value === "hidden" ? value : "unknown";
}

function buy100(metrics: unknown): number | null {
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const table = metrics as Record<string, unknown>;
  for (const key of ["buy100_cost_bps", "buy100CostBps"]) {
    const parsed = numberOrNull(table[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function effectiveCronScope(scope: string | undefined, production: boolean): CronScope {
  if (scope === "curated") return "curated";
  if (scope === "all") return production ? "listed" : "all";
  return "listed";
}

function isVisible(asset: Annotated, scope: CronScope): boolean {
  if (asset.safetyStatus === "hidden") return false;
  if (scope === "curated") {
    if (asset.curated) return true;
    return asset.issuer === "ondo" && (asset.safetyStatus === "watch" || asset.safetyStatus === "listed");
  }
  if (scope === "listed") {
    return asset.safetyStatus === "listed" || asset.safetyStatus === "watch" || asset.transitionKept;
  }
  return true;
}

function statusRank(status: CronSafety): number {
  if (status === "listed") return 0;
  if (status === "watch") return 1;
  return 2;
}

function annotate(rows: readonly Annotated[], fromSupabase: boolean): Annotated[] {
  const transition = fromSupabase && rows.length > 0 && !rows.some((row) => row.safetyStatus === "listed");
  return rows.map((asset) => {
    if (asset.safetyStatus === "hidden") {
      return { ...asset, tradable: false, transitionKept: false };
    }
    if (transition && asset.curated) {
      const operable = asset.tradable;
      return { ...asset, tradable: operable, transitionKept: operable };
    }
    if (asset.issuer === "ondo" && asset.safetyStatus === "watch" && asset.tradable) {
      return { ...asset, tradable: true, transitionKept: false };
    }
    const listed = asset.safetyStatus === "listed" && asset.tradable;
    return { ...asset, tradable: listed, transitionKept: false };
  });
}

function pickOne(
  rows: readonly Annotated[],
  winners: ReadonlyMap<string, "xstocks" | "ondo">,
): Annotated[] {
  const groups = new Map<string, Annotated[]>();
  for (const asset of rows) {
    const key = asset.companyTicker.trim() || asset.symbol;
    const list = groups.get(key) ?? [];
    list.push(asset);
    groups.set(key, list);
  }
  const chosen: Annotated[] = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => {
      if (a.tradable !== b.tradable) return a.tradable ? -1 : 1;
      if (a.curated !== b.curated) return a.curated ? -1 : 1;
      const status = statusRank(a.safetyStatus) - statusRank(b.safetyStatus);
      if (status !== 0) return status;
      if (a.buy100CostBps !== null || b.buy100CostBps !== null) {
        if (a.buy100CostBps === null) return 1;
        if (b.buy100CostBps === null) return -1;
        if (a.buy100CostBps !== b.buy100CostBps) return a.buy100CostBps - b.buy100CostBps;
      }
      const winner = winners.get(a.companyTicker) ?? null;
      const winA = winner !== null && a.issuer === winner ? 0 : 1;
      const winB = winner !== null && b.issuer === winner ? 0 : 1;
      if (winA !== winB) return winA - winB;
      if (a.symbol < b.symbol) return -1;
      if (a.symbol > b.symbol) return 1;
      return 0;
    });
    const first = ordered[0];
    if (first) chosen.push(first);
  }
  chosen.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return chosen;
}

/** Filas de `public.assets` → una ficha visible por empresa, con mint. */
export function selectVisiblePriceAssets(
  rows: readonly CronAssetInput[],
  options: SelectVisibleOptions = {},
): VisiblePriceAsset[] {
  const scope = effectiveCronScope(options.scope, options.production === true);
  const fromSupabase = options.fromSupabase !== false;
  const mapped: Annotated[] = [];
  for (const row of rows) {
    const symbol = text(row.symbol);
    if (!symbol) continue;
    const underlying = text(row.underlying) ?? symbol.replace(/x$/i, "");
    const enabled = row.enabled !== false;
    const halted = row.is_trading_halted === true;
    mapped.push({
      symbol,
      mint: text(row.mint_solana) ?? "",
      issuer: row.issuer === "ondo" ? "ondo" : "xstocks",
      companyTicker: text(row.company_ticker) ?? underlying,
      curated: row.curated === true,
      safetyStatus: safetyOf(row.safety_status),
      tradable: enabled && !halted,
      transitionKept: false,
      buy100CostBps: buy100(row.safety_metrics),
    });
  }
  const visible = annotate(mapped, fromSupabase).filter(
    (asset) => asset.safetyStatus !== "hidden" && isVisible(asset, scope),
  );
  return pickOne(visible, options.volumeWinners ?? new Map()).map((asset) => ({
    symbol: asset.symbol,
    mint: asset.mint,
    issuer: asset.issuer,
    companyTicker: asset.companyTicker,
  }));
}
