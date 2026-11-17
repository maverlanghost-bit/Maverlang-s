const ENTRY = "market-return-entry";
const RESTORE = "market-return-scroll";
const MAX_AGE = 30 * 60_000;
const KEYS = new Set(["q", "paginas", "vista", "filtro", "orden"]);

type MarketReturn = { href: string; target: string; scrollY: number; capturedAt: number };

function readEntry(): MarketReturn | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ENTRY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const entry = value as Partial<MarketReturn>;
    if (typeof entry.href !== "string" || typeof entry.target !== "string" || typeof entry.scrollY !== "number" || !Number.isFinite(entry.scrollY) || entry.scrollY < 0 || typeof entry.capturedAt !== "number" || !Number.isFinite(entry.capturedAt) || Date.now() - entry.capturedAt > MAX_AGE || entry.capturedAt > Date.now()) return null;
    const url = new URL(entry.href, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/app" || url.hash || [...url.searchParams.keys()].some((key) => !KEYS.has(key))) return null;
    if (!/^\/app\/accion\/[^/]+$/.test(entry.target)) return null;
    return { href: `${url.pathname}${url.search}`, target: entry.target, scrollY: entry.scrollY, capturedAt: entry.capturedAt };
  } catch { return null; }
}

export function rememberMarketEntry(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
  const destination = new URL(link.href);
  if (destination.origin !== window.location.origin || !/^\/app\/accion\/[^/]+$/.test(destination.pathname)) return;
  const params = new URLSearchParams(window.location.search);
  for (const key of [...params.keys()]) if (!KEYS.has(key)) params.delete(key);
  const search = params.toString();
  try { sessionStorage.setItem(ENTRY, JSON.stringify({ href: `/app${search ? `?${search}` : ""}`, target: destination.pathname, scrollY: window.scrollY, capturedAt: Date.now() })); } catch { /* Storage unavailable: default link remains usable. */ }
}

export function consumeMarketEntry(target: string): MarketReturn | null {
  const entry = readEntry();
  try { sessionStorage.removeItem(ENTRY); } catch { /* Ignore unavailable storage. */ }
  return entry?.target === target ? entry : null;
}

export function markMarketReturn(entry: MarketReturn) {
  try { sessionStorage.setItem(RESTORE, JSON.stringify({ href: entry.href, scrollY: entry.scrollY, capturedAt: Date.now() })); } catch { /* Navigation still works. */ }
}

export function takeMarketScroll(): number | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(RESTORE) ?? "null");
    sessionStorage.removeItem(RESTORE);
    if (!value || typeof value !== "object") return null;
    const entry = value as { href?: unknown; scrollY?: unknown; capturedAt?: unknown };
    if (entry.href !== `/app${window.location.search}` || typeof entry.scrollY !== "number" || !Number.isFinite(entry.scrollY) || entry.scrollY < 0 || typeof entry.capturedAt !== "number" || !Number.isFinite(entry.capturedAt) || Date.now() - entry.capturedAt > MAX_AGE || entry.capturedAt > Date.now()) return null;
    return entry.scrollY;
  } catch { return null; }
}
