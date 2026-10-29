import "server-only";

import { findAssetBySymbol } from "@/lib/catalog/assets";
import { DomainError } from "@/lib/api/result";
import { enviarEmail, remitenteDefault } from "@/lib/email/resend";
import { plantillaAlertaPrecio } from "@/lib/email/templates";
import { yahooSymbol } from "@/lib/market/underlying-move";
import {
  ACTIVE_ALERT_CAP,
  ACTIVE_ALERT_CAP_MESSAGE,
  alertsToTrigger,
  canCreateActiveAlert,
  chunkSymbols,
  isAlertId,
  normalizeAlertPrice,
  normalizeAlertSymbol,
  pickReferencePrice,
  type AlertDirection,
  type AlertStorage,
  type PriceAlert,
  type PriceAlertCronSummary,
} from "@/lib/services/alerts-logic";
import {
  AlertStoreUnavailable,
  dbAlertRecipients,
  dbCreateAlert,
  dbDeleteAlert,
  dbListAlerts,
  dbListOpenAlerts,
  dbMarkTriggered,
} from "@/lib/services/alerts.supabase";
import { livePrices } from "@/lib/services/prices.live";
import { readUnderlyingCloses } from "@/lib/services/underlying-prices.supabase";

/**
 * Avisos de precio. En mock, o si la tabla no está, viven en memoria de
 * este proceso y el cron no dispara correos ni usa precios de relleno.
 * Con datos live, la fila es de `price_alerts` (RLS) y el cron compara
 * el último cierre real o, si no hay, el precio actual del token.
 */

type MemoryAlert = PriceAlert & { userId: string };

const memoryAlerts: MemoryAlert[] = [];

const BUDGET_MS = 45_000;

function isLiveData(): boolean {
  const raw = (process.env.DATA_MODE ?? process.env.NEXT_PUBLIC_DATA_MODE ?? "mock").trim();
  return raw === "live";
}

function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function pricesLive(): boolean {
  return (process.env.PRICES_MODE ?? "").trim() === "live";
}

function strip(row: MemoryAlert): PriceAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    priceUsd: row.priceUsd,
    active: row.active,
    triggeredAt: row.triggeredAt,
    createdAt: row.createdAt,
  };
}

function memoryList(userId: string): PriceAlert[] {
  return memoryAlerts
    .filter((row) => row.userId === userId)
    .map(strip)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function memoryActiveCount(userId: string): number {
  return memoryAlerts.filter((row) => row.userId === userId && row.active && row.triggeredAt == null).length;
}

function memoryCreate(userId: string, input: { symbol: string; direction: AlertDirection; priceUsd: number }): PriceAlert {
  const symbol = normalizeAlertSymbol(input.symbol);
  const priceUsd = normalizeAlertPrice(input.priceUsd);
  if (!symbol || priceUsd == null) throw new DomainError("VALIDATION", "El precio tiene que ser mayor que cero.");
  if (!canCreateActiveAlert(memoryActiveCount(userId))) {
    throw new DomainError("VALIDATION", ACTIVE_ALERT_CAP_MESSAGE);
  }
  const row: MemoryAlert = {
    id: crypto.randomUUID(),
    userId,
    symbol,
    direction: input.direction,
    priceUsd,
    active: true,
    triggeredAt: null,
    createdAt: new Date().toISOString(),
  };
  memoryAlerts.push(row);
  if (memoryActiveCount(userId) > ACTIVE_ALERT_CAP) {
    const index = memoryAlerts.findIndex((item) => item.id === row.id);
    if (index >= 0) memoryAlerts.splice(index, 1);
    throw new DomainError("VALIDATION", ACTIVE_ALERT_CAP_MESSAGE);
  }
  return strip(row);
}

function memoryDelete(userId: string, id: string): PriceAlert {
  if (!isAlertId(id)) throw new DomainError("VALIDATION");
  const index = memoryAlerts.findIndex((row) => row.id === id && row.userId === userId);
  const row = index >= 0 ? memoryAlerts[index] : undefined;
  if (!row) throw new DomainError("NOT_FOUND");
  memoryAlerts.splice(index, 1);
  return strip(row);
}

function emptySummary(mode: PriceAlertCronSummary["mode"]): PriceAlertCronSummary {
  return { ok: true, mode, checked: 0, triggered: 0, emailed: 0, skipped: 0, truncated: false };
}

export async function listUserAlerts(userId: string): Promise<{ alerts: PriceAlert[]; storage: AlertStorage }> {
  if (!userId) throw new DomainError("UNAUTHORIZED");
  if (!isLiveData()) return { alerts: memoryList(userId), storage: "memory" };
  try {
    return { alerts: await dbListAlerts(userId), storage: "db" };
  } catch (error) {
    if (error instanceof AlertStoreUnavailable) return { alerts: memoryList(userId), storage: "memory" };
    if (error instanceof DomainError) throw error;
    throw new DomainError("UPSTREAM");
  }
}

export async function createUserAlert(
  userId: string,
  input: { symbol: string; direction: AlertDirection; priceUsd: number },
): Promise<{ alert: PriceAlert; storage: AlertStorage }> {
  if (!userId) throw new DomainError("UNAUTHORIZED");
  if (!isLiveData()) return { alert: memoryCreate(userId, input), storage: "memory" };
  try {
    return { alert: await dbCreateAlert(userId, input), storage: "db" };
  } catch (error) {
    if (error instanceof AlertStoreUnavailable) return { alert: memoryCreate(userId, input), storage: "memory" };
    if (error instanceof DomainError) throw error;
    throw new DomainError("UPSTREAM");
  }
}

export async function deleteUserAlert(userId: string, id: string): Promise<{ alert: PriceAlert; storage: AlertStorage }> {
  if (!userId) throw new DomainError("UNAUTHORIZED");
  if (!isLiveData()) return { alert: memoryDelete(userId, id), storage: "memory" };
  try {
    return { alert: await dbDeleteAlert(userId, id), storage: "db" };
  } catch (error) {
    if (error instanceof AlertStoreUnavailable) return { alert: memoryDelete(userId, id), storage: "memory" };
    if (error instanceof DomainError) throw error;
    throw new DomainError("UPSTREAM");
  }
}

async function readClose(symbol: string): Promise<number | null> {
  try {
    const asset = await findAssetBySymbol(symbol, { scope: "all" });
    const underlying = asset?.underlying?.trim() ? yahooSymbol(asset.underlying) : "";
    if (!underlying) return null;
    const points = await readUnderlyingCloses(underlying, "1M");
    const last = points.length > 0 ? points[points.length - 1] : undefined;
    return last && last.p > 0 ? last.p : null;
  } catch {
    return null;
  }
}

async function referencePrices(
  symbols: readonly string[],
  deadline: number,
): Promise<{ prices: Map<string, number | null>; truncated: boolean }> {
  const closes = new Map<string, number | null>();
  let truncated = false;
  for (const symbol of symbols) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    closes.set(symbol.toLowerCase(), await readClose(symbol));
  }
  const multipliers = new Map<string, number | null>();
  const tokens = new Map<string, { usd: number | null; real: boolean }>();
  const asked = [...closes.keys()];
  if (pricesLive() && asked.length > 0) {
    for (const chunk of chunkSymbols(asked, 50)) {
      if (Date.now() > deadline) {
        truncated = true;
        break;
      }
      try {
        const quotes = await livePrices.list(chunk);
        for (const quote of quotes) {
          const key = quote.symbol.toLowerCase();
          multipliers.set(key, Number.isFinite(quote.multiplier) && quote.multiplier > 0 ? quote.multiplier : null);
          const real = quote.source === "jupiter" && quote.reference !== true && quote.priceUsd > 0;
          tokens.set(key, { usd: real ? quote.priceUsd : null, real });
        }
      } catch {
        // Sin precio de token: queda el cierre, si hubo.
      }
    }
  }
  const prices = new Map<string, number | null>();
  for (const [symbol, closeUsd] of closes) {
    const token = tokens.get(symbol);
    prices.set(
      symbol,
      pickReferencePrice({
        closeUsd,
        multiplier: multipliers.get(symbol) ?? null,
        tokenUsd: token?.usd ?? null,
        tokenReal: token?.real === true,
      }),
    );
  }
  return { prices, truncated };
}

/**
 * Corrida diaria. Mock o sin tabla: ceros, sin error y sin precios de relleno.
 * Live: marca `triggered_at` y envía correo si hay proveedor. Sin proveedor
 * el aviso queda registrado y el cron no falla.
 */
export async function runDailyPriceAlerts(now = Date.now()): Promise<PriceAlertCronSummary> {
  if (!isLiveData()) return emptySummary("mock");
  let open;
  try {
    open = await dbListOpenAlerts();
  } catch (error) {
    if (error instanceof AlertStoreUnavailable) {
      console.warn("[price-alerts] sin tabla o sin base: corrida omitida");
      return emptySummary("unavailable");
    }
    if (error instanceof DomainError) throw error;
    throw new DomainError("UPSTREAM");
  }
  const deadline = now + BUDGET_MS;
  const symbols = [...new Set(open.map((alert) => alert.symbol))];
  const { prices, truncated: priceCut } = await referencePrices(symbols, deadline);
  const priced = new Set(prices.keys());
  const examined = open.filter((alert) => priced.has(alert.symbol.toLowerCase()));
  let skipped = 0;
  for (const alert of examined) {
    const value = prices.get(alert.symbol.toLowerCase());
    if (value == null) skipped += 1;
  }
  const hits = alertsToTrigger(examined, prices);
  const hitById = new Map(hits.map((hit) => [hit.id, hit.observedUsd]));
  let recipients = new Map<string, { email: string; language: "es-CL" | "en" }>();
  if (hits.length > 0) {
    try {
      recipients = await dbAlertRecipients(hits.map((hit) => open.find((alert) => alert.id === hit.id)?.userId ?? ""));
    } catch (error) {
      if (!(error instanceof AlertStoreUnavailable)) {
        console.warn("[price-alerts] no se pudieron leer los correos");
      }
      recipients = new Map();
    }
  }
  let triggered = 0;
  let emailed = 0;
  let truncated = priceCut || open.length >= 2000;
  let loggedNoProvider = false;
  const names = new Map<string, string>();
  for (const alert of examined) {
    const observed = hitById.get(alert.id);
    if (observed == null) continue;
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    let marked = false;
    try {
      marked = await dbMarkTriggered(alert.id, new Date().toISOString());
    } catch (error) {
      if (error instanceof AlertStoreUnavailable) {
        console.warn("[price-alerts] sin tabla al marcar: corrida cortada");
        truncated = true;
        break;
      }
      console.warn("[price-alerts] no se pudo marcar un aviso");
      continue;
    }
    if (!marked) continue;
    triggered += 1;
    console.info(`[price-alerts] aviso registrado symbol=${alert.symbol}`);
    const recipient = recipients.get(alert.userId);
    if (!recipient) {
      console.info("[price-alerts] aviso registrado sin correo");
      continue;
    }
    if (!emailConfigured()) {
      if (!loggedNoProvider) {
        loggedNoProvider = true;
        console.warn("[price-alerts] sin proveedor de correo: el aviso queda registrado y no se envía");
      }
      continue;
    }
    let name = names.get(alert.symbol.toLowerCase());
    if (!name) {
      try {
        const asset = await findAssetBySymbol(alert.symbol, { scope: "all" });
        name = asset?.name?.trim() || alert.symbol;
      } catch {
        name = alert.symbol;
      }
      names.set(alert.symbol.toLowerCase(), name);
    }
    const template = plantillaAlertaPrecio({
      symbol: alert.symbol,
      name,
      direction: alert.direction,
      thresholdUsd: alert.priceUsd,
      observedUsd: observed,
      language: recipient.language,
    });
    try {
      await enviarEmail(remitenteDefault(), recipient.email, template.subject, template.html);
      emailed += 1;
    } catch {
      console.warn("[price-alerts] no se pudo enviar el correo");
    }
  }
  const summary: PriceAlertCronSummary = {
    ok: true,
    mode: "live",
    checked: examined.length,
    triggered,
    emailed,
    skipped,
    truncated,
  };
  console.info(
    `[price-alerts] mode=live checked=${summary.checked} triggered=${summary.triggered} emailed=${summary.emailed} skipped=${summary.skipped}`,
  );
  return summary;
}
