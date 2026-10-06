/**
 * Ayudas puras del catálogo xStocks (M37).
 * Las usa la app y los tests. El script scripts/sync-xstocks.mjs
 * replica esta lógica en JS simple (no importa TS).
 */

export interface XstocksDeployment {
  network?: unknown;
  address?: unknown;
}

export interface XstocksNode {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  isin?: unknown;
  underlyingSymbol?: unknown;
  underlyingIsin?: unknown;
  underlying?: {
    symbol?: unknown;
    isin?: unknown;
    currency?: unknown;
    exchange?: {
      mic?: unknown;
      name?: unknown;
      timezone?: unknown;
    } | null;
  } | null;
  description?: unknown;
  logo?: unknown;
  isTradingHalted?: unknown;
  trading?: {
    currency?: unknown;
    tradingHoursMode?: unknown;
    isTradingHalted?: unknown;
    currentPeriod?: unknown;
    openNow?: unknown;
    nextChangeAt?: unknown;
    limitsPerPeriod?: unknown;
  } | null;
  deployments?: unknown;
}

export interface ParsedAsset {
  xstocksId: string | null;
  symbol: string;
  name: string;
  underlying: string;
  underlyingCurrency: string | null;
  isin: string | null;
  underlyingIsin: string | null;
  exchangeMic: string | null;
  exchangeName: string | null;
  exchangeTimezone: string | null;
  mintSolana: string | null;
  logoUrl: string | null;
  tradingHoursMode: string | null;
  isTradingHalted: boolean;
  currentPeriod: string | null;
  openNow: boolean | null;
  nextChangeAt: string | null;
  limits: unknown;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Mint en Solana desde deployments[].address (network === "Solana"). */
export function solanaMintFromNode(node: Pick<XstocksNode, "deployments">): string | null {
  const list = node.deployments;
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as XstocksDeployment;
    if (entry.network !== "Solana") continue;
    const address = text(entry.address);
    if (address) return address;
  }
  return null;
}

/** Nombre visible: "Apple xStock" -> "Apple". */
export function displayNameFromApi(name: string, symbol: string, underlying: string): string {
  const trimmed = name.trim();
  const withoutSuffix = trimmed
    .replace(/\s+xStocks?$/i, "")
    .trim();
  if (withoutSuffix.length > 0) return withoutSuffix;
  if (underlying.trim().length > 0) return underlying.trim();
  return symbol.trim();
}

/** Archivo seguro para public/logos, ej. "BRK.B" -> "brk-b.png". */
export function safeLogoFileName(underlyingOrSymbol: string): string {
  const base = underlyingOrSymbol.trim().toLowerCase();
  const slug = base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug.length > 0 ? slug : "token"}.png`;
}

/** Ruta local del logo, ej. "/logos/aapl.png". */
export function logoPathFor(underlying: string): string {
  return `/logos/${safeLogoFileName(underlying)}`;
}

/** true si el símbolo está en la lista curada (comparación exacta). */
export function selectCurated<T extends { symbol: string }>(
  assets: readonly T[],
  curatedSymbols: ReadonlySet<string> | readonly string[],
): T[] {
  const wanted: Set<string> =
    curatedSymbols instanceof Set ? curatedSymbols : new Set(curatedSymbols as readonly string[]);
  return assets.filter((asset) => wanted.has(asset.symbol));
}

export function parseXstocksNode(node: XstocksNode): ParsedAsset | null {
  const symbol = text(node.symbol);
  if (!symbol) return null;
  const underlyingObj =
    typeof node.underlying === "object" && node.underlying !== null ? node.underlying : null;
  const exchange =
    underlyingObj && typeof underlyingObj.exchange === "object" && underlyingObj.exchange !== null
      ? underlyingObj.exchange
      : null;
  const underlying =
    text(node.underlyingSymbol) ?? text(underlyingObj?.symbol) ?? symbol.replace(/x$/i, "");
  const rawName = text(node.name) ?? symbol;
  const trading =
    typeof node.trading === "object" && node.trading !== null ? node.trading : null;
  const halted = bool(node.isTradingHalted, false) || bool(trading?.isTradingHalted, false);
  const openRaw = trading?.openNow;
  return {
    xstocksId: text(node.id),
    symbol,
    name: displayNameFromApi(rawName, symbol, underlying ?? symbol),
    underlying: underlying ?? symbol,
    underlyingCurrency: text(underlyingObj?.currency) ?? "USD",
    isin: text(node.isin),
    underlyingIsin: text(node.underlyingIsin) ?? text(underlyingObj?.isin),
    exchangeMic: exchange ? text(exchange.mic) : null,
    exchangeName: exchange ? text(exchange.name) : null,
    exchangeTimezone: exchange ? text(exchange.timezone) : null,
    mintSolana: solanaMintFromNode(node),
    logoUrl: text(node.logo),
    tradingHoursMode: text(trading?.tradingHoursMode),
    isTradingHalted: halted,
    currentPeriod: text(trading?.currentPeriod),
    openNow: typeof openRaw === "boolean" ? openRaw : null,
    nextChangeAt: text(trading?.nextChangeAt),
    limits: trading?.limitsPerPeriod ?? null,
  };
}
