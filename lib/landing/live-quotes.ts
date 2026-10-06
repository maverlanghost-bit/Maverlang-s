import "server-only";

import { serverEnv } from "@/lib/env";
import { getServices } from "@/lib/services";
import { ILLUSTRATIVE_NOTICE, landingQuotes } from "@/lib/mocks/landing";
import type { LandingQuote } from "@/lib/mocks/landing";
import type { Quote } from "@/lib/types";

/**
 * Quotes de la portada con precios reales en dólares (M42).
 * Pide los símbolos de muestra de `lib/mocks/landing.ts` a
 * `getServices().prices.list` en UNA llamada, con timeout corto y cache en
 * memoria. Si falla, expira el tiempo o no hay `PRICES_MODE=live`, devuelve
 * los valores de muestra con `live: false`.
 * La portada NO usa sparklines: el historial live no es real (serie mock
 * anclada al spot), así que las quotes salen sin ese campo.
 */

/** Etiqueta discreta cuando los precios son reales. */
export const LANDING_LIVE_NOTICE = "Precios en dólares (US$), en vivo";

/** Etiqueta según el origen: en vivo o muestra. */
export function landingNotice(live: boolean): string {
  return live ? LANDING_LIVE_NOTICE : ILLUSTRATIVE_NOTICE;
}

/** Símbolos de la portada: los mismos de la muestra. */
export const LANDING_SYMBOLS: readonly string[] = landingQuotes.map((quote) => quote.symbol);

/** Timeout corto para no frenar la portada. */
export const LANDING_QUOTES_TIMEOUT_MS = 2_500;
/** Cache en memoria del servidor. */
export const LANDING_QUOTES_TTL_MS = 30_000;

export interface LandingQuotes {
  quotes: LandingQuote[];
  live: boolean;
  updatedAt: string;
}

export interface LandingQuotesDeps {
  list?: (symbols: string[]) => Promise<Quote[]>;
  /** Por defecto, `serverEnv.PRICES_MODE === "live"`. */
  live?: boolean;
  now?: () => number;
  timeoutMs?: number;
}

let cached: { at: number; data: LandingQuotes } | null = null;

/** Limpia la cache en memoria (tests). */
export function resetLandingQuotesCache(): void {
  cached = null;
}

function sampleQuotes(): LandingQuote[] {
  return landingQuotes.map((quote) => ({
    symbol: quote.symbol,
    underlying: quote.underlying,
    name: quote.name,
    logo: quote.logo,
    href: quote.href,
    priceUsd: quote.priceUsd,
    change: quote.change,
    live: false,
  }));
}

function isLiveQuote(quote: Quote | undefined): quote is Quote {
  return (
    quote !== undefined &&
    quote.source === "jupiter" &&
    quote.reference !== true &&
    Number.isFinite(quote.priceUsd) &&
    quote.priceUsd > 0 &&
    Number.isFinite(quote.change24hPct)
  );
}

function newestUpdatedAt(quotes: Quote[], nowMs: number): string {
  let best = Number.NaN;
  for (const quote of quotes) {
    const time = Date.parse(quote.updatedAt);
    if (Number.isFinite(time) && (Number.isNaN(best) || time > best)) best = time;
  }
  return new Date(Number.isNaN(best) ? nowMs : best).toISOString();
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      timer = undefined;
      reject(new Error("LANDING_QUOTES_TIMEOUT"));
    }, ms);
    work.then(
      (value) => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (timer !== undefined) clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function getLandingQuotes(deps?: LandingQuotesDeps): Promise<LandingQuotes> {
  const nowFn = deps?.now ?? Date.now;
  const injected = deps?.list !== undefined || deps?.live !== undefined;
  if (!injected && cached && nowFn() - cached.at < LANDING_QUOTES_TTL_MS) return cached.data;

  const liveMode = deps?.live ?? serverEnv.PRICES_MODE === "live";
  const fallback = (): LandingQuotes => ({
    quotes: sampleQuotes(),
    live: false,
    updatedAt: new Date(nowFn()).toISOString(),
  });

  if (!liveMode) {
    const data = fallback();
    if (!injected) cached = { at: nowFn(), data };
    return data;
  }

  try {
    const list = deps?.list ?? ((symbols: string[]) => getServices().prices.list(symbols));
    const timeoutMs = deps?.timeoutMs ?? LANDING_QUOTES_TIMEOUT_MS;
    const fetched = await withTimeout(list([...LANDING_SYMBOLS]), timeoutMs);
    const bySymbol = new Map(fetched.map((quote) => [quote.symbol, quote]));
    const samples = sampleQuotes();
    const quotes = samples.map((sample) => {
      const quote = bySymbol.get(sample.symbol);
      if (!isLiveQuote(quote)) return sample;
      return { ...sample, priceUsd: quote.priceUsd, change: quote.change24hPct, live: true };
    });
    const live = quotes.every((quote) => quote.live === true);
    const data: LandingQuotes = {
      quotes,
      live,
      updatedAt: live ? newestUpdatedAt(fetched, nowFn()) : new Date(nowFn()).toISOString(),
    };
    if (!injected) cached = { at: nowFn(), data };
    return data;
  } catch {
    const data = fallback();
    if (!injected) cached = { at: nowFn(), data };
    return data;
  }
}
