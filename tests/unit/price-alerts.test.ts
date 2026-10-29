import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { priceAlertCreateSchema, priceAlertDeleteSchema } from "@/lib/api/contracts";
import { INFO_ONLY_EN, INFO_ONLY_ES, alertasCopy, alertasText, fillAlert } from "@/content/i18n/extra-alertas";
import { plantillaAlertaPrecio } from "@/lib/email/templates";
import {
  ACTIVE_ALERT_CAP,
  alertsToTrigger,
  canCreateActiveAlert,
  chunkSymbols,
  formatAlertUsd,
  normalizeAlertPrice,
  normalizeAlertSymbol,
  parseAlertPriceInput,
  pickReferencePrice,
  sortFavoriteRows,
  uniqueSymbols,
  type PriceAlert,
} from "@/lib/services/alerts-logic";

const root = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function alert(partial: Partial<PriceAlert> & Pick<PriceAlert, "id" | "symbol" | "direction" | "priceUsd">): PriceAlert {
  return {
    active: true,
    triggeredAt: null,
    createdAt: "2026-10-28T12:00:00.000Z",
    ...partial,
  };
}

describe("avisos de precio: reglas puras", () => {
  it("normaliza símbolo y precio a 4 decimales", () => {
    expect(normalizeAlertSymbol(" AAPLx ")).toBe("AAPLx");
    expect(normalizeAlertSymbol("ABNBon")).toBe("ABNBon");
    expect(normalizeAlertSymbol("AAPLX")).toBeNull();
    expect(normalizeAlertSymbol("AAPL")).toBeNull();
    expect(normalizeAlertPrice(1.23456)).toBe(1.2346);
    expect(normalizeAlertPrice(0)).toBeNull();
    expect(normalizeAlertPrice(-3)).toBeNull();
    expect(normalizeAlertPrice(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("acepta 180,5 y 180.5, y rechaza basura", () => {
    expect(parseAlertPriceInput("180,5")).toBe(180.5);
    expect(parseAlertPriceInput("180.50")).toBe(180.5);
    expect(parseAlertPriceInput("")).toBeNull();
    expect(parseAlertPriceInput("0")).toBeNull();
    expect(parseAlertPriceInput("1.2.3")).toBeNull();
    expect(parseAlertPriceInput("1,800.50")).toBeNull();
  });

  it("el tope es 20 activos", () => {
    expect(canCreateActiveAlert(19)).toBe(true);
    expect(canCreateActiveAlert(ACTIVE_ALERT_CAP)).toBe(false);
    expect(canCreateActiveAlert(-1)).toBe(false);
    expect(canCreateActiveAlert(1.5)).toBe(false);
  });

  it("sube de y baja de incluyen el nivel; sin precio no hay cruce", () => {
    expect(alertsToTrigger([alert({ id: "1", symbol: "AAPLx", direction: "above", priceUsd: 10 })], new Map([["aaplx", 10]]))).toEqual([
      { id: "1", observedUsd: 10 },
    ]);
    expect(alertsToTrigger([alert({ id: "1", symbol: "AAPLx", direction: "above", priceUsd: 10 })], new Map([["aaplx", 9.99]]))).toEqual([]);
    expect(alertsToTrigger([alert({ id: "2", symbol: "NVDAx", direction: "below", priceUsd: 10 })], new Map([["nvdax", 10]]))).toEqual([
      { id: "2", observedUsd: 10 },
    ]);
    expect(
      alertsToTrigger(
        [
          alert({ id: "3", symbol: "AAPLx", direction: "above", priceUsd: 1, active: false }),
          alert({ id: "4", symbol: "AAPLx", direction: "above", priceUsd: 1, triggeredAt: "2026-10-27T00:00:00.000Z" }),
          alert({ id: "5", symbol: "MSFTx", direction: "below", priceUsd: 1 }),
        ],
        new Map([
          ["aaplx", 20],
          ["msftx", null],
        ]),
      ),
    ).toEqual([]);
  });

  it("prefiere el cierre real y no usa un precio de relleno", () => {
    expect(pickReferencePrice({ closeUsd: 100, multiplier: 2, tokenUsd: 50, tokenReal: true })).toBe(200);
    expect(pickReferencePrice({ closeUsd: null, multiplier: 1, tokenUsd: 50, tokenReal: true })).toBe(50);
    expect(pickReferencePrice({ closeUsd: null, multiplier: 1, tokenUsd: 50, tokenReal: false })).toBeNull();
    expect(pickReferencePrice({ closeUsd: 10, multiplier: null, tokenUsd: null, tokenReal: false })).toBe(10);
    expect(pickReferencePrice({ closeUsd: 0, multiplier: 1, tokenUsd: null, tokenReal: false })).toBeNull();
  });

  it("ordena favoritas por cambio (sin dato al final) y por nombre", () => {
    const rows = [
      { symbol: "B", name: "Beta", change24hPct: null },
      { symbol: "A", name: "Alfa", change24hPct: 0.01 },
      { symbol: "C", name: "Cero", change24hPct: 0 },
    ];
    expect(sortFavoriteRows(rows, "change").map((row) => row.symbol)).toEqual(["A", "C", "B"]);
    expect(sortFavoriteRows(rows, "name").map((row) => row.symbol)).toEqual(["A", "B", "C"]);
  });

  it("parte símbolos sin duplicar por mayúsculas", () => {
    expect(uniqueSymbols([" AAPLx ", "aaplx", "NVDAx"])).toEqual(["AAPLx", "NVDAx"]);
    expect(chunkSymbols(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
    expect(formatAlertUsd(180.5)).toBe("US$180.50");
    expect(formatAlertUsd(1.2346)).toBe("US$1.2346");
  });
});

describe("avisos de precio: textos y correo", () => {
  it("es-CL y en tienen la misma forma y el aviso informativo", () => {
    expect(Object.keys(alertasCopy.esCL).sort()).toEqual(Object.keys(alertasCopy.en).sort());
    expect(alertasText("es-CL").disclaimer).toBe(INFO_ONLY_ES);
    expect(alertasText("en").disclaimer).toBe(INFO_ONLY_EN);
    expect(fillAlert(alertasText("es-CL").rowAbove, { symbol: "AAPLx", price: "US$10" })).toBe("Avísame si AAPLx sube de US$10");
    const blob = `${JSON.stringify(alertasCopy)} ${read("app/(platform)/app/favoritas/favoritas-screen.tsx")} ${read("components/domain/alert-button.tsx")}`;
    expect(blob.toLowerCase()).not.toMatch(/compra|vende|\bbuy\b|\bsell\b|consenso/);
  });

  it("el correo dice el dato y no recomienda operar", () => {
    const es = plantillaAlertaPrecio({
      symbol: "AAPLx",
      name: "Apple",
      direction: "above",
      thresholdUsd: 180.5,
      observedUsd: 181,
      language: "es-CL",
    });
    expect(es.subject).toBe("Aviso de precio: AAPLx");
    expect(es.html).toContain(INFO_ONLY_ES);
    expect(es.html).toContain("US$180.50");
    expect(es.html).toContain("US$181.00");
    expect(es.html).toContain("/app/accion/AAPLx");
    const en = plantillaAlertaPrecio({
      symbol: "NVDAx",
      name: "Nvidia <x>",
      direction: "below",
      thresholdUsd: 10,
      observedUsd: 9.5,
      language: "en",
    });
    expect(en.html).toContain(INFO_ONLY_EN);
    expect(en.html).toContain("Nvidia &lt;x&gt;");
    expect(en.html.toLowerCase()).not.toMatch(/compra|vende|\bbuy\b|\bsell\b/);
    expect(es.html.toLowerCase()).not.toMatch(/compra|vende|\bbuy\b|\bsell\b/);
  });
});

describe("avisos de precio: contrato, tabla y cron", () => {
  it("zod rechaza símbolo, precio y campos de más", () => {
    expect(priceAlertCreateSchema.safeParse({ symbol: "AAPLx", direction: "above", priceUsd: 10 }).success).toBe(true);
    expect(priceAlertCreateSchema.safeParse({ symbol: "AAPLX", direction: "above", priceUsd: 10 }).success).toBe(false);
    expect(priceAlertCreateSchema.safeParse({ symbol: "AAPLx", direction: "above", priceUsd: 0 }).success).toBe(false);
    expect(priceAlertCreateSchema.safeParse({ symbol: "AAPLx", direction: "above", priceUsd: 10, extra: true }).success).toBe(false);
    expect(priceAlertDeleteSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(priceAlertDeleteSchema.safeParse({ id: "no" }).success).toBe(false);
  });

  it("la migración es aditiva, con RLS propia y sin tope en SQL", () => {
    const sql = read("supabase/migrations/0033_price_alerts.sql");
    expect(sql).toContain("create table if not exists public.price_alerts");
    expect(sql).toContain("references auth.users (id) on delete cascade");
    expect(sql).toContain("check (direction in ('above', 'below'))");
    expect(sql).toContain("check (price_usd > 0)");
    expect(sql).toContain("price_alerts_user_id_idx");
    expect(sql).toContain("price_alerts_active_symbol_idx");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for select");
    expect(sql).toContain("for insert");
    expect(sql).toContain("for delete");
    expect(sql).toContain("grant select, insert, delete on table public.price_alerts to authenticated");
    expect(sql.toLowerCase()).not.toContain("check (20");
  });

  it("el cron diario está una vez y la ruta exige el secreto", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
    const matches = vercel.crons.filter((cron) => cron.path === "/api/cron/price-alerts");
    expect(matches).toEqual([{ path: "/api/cron/price-alerts", schedule: "45 22 * * *" }]);
    const route = read("app/api/cron/price-alerts/route.ts");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("Bearer ");
    const api = read("app/api/me/alerts/route.ts");
    expect(api).toContain("parseJson");
    expect(api).toContain("assertSameOrigin");
    expect(api).toContain('withRateLimit(req, "me"');
    expect(api).toContain("requireSession");
    const service = read("lib/services/alerts.ts");
    expect(service).toContain('emptySummary("mock")');
    expect(service).toContain("sin proveedor de correo");
    const screen = read("app/(platform)/app/favoritas/favoritas-screen.tsx");
    expect(screen).toContain("isRealSparkHistory");
    expect(screen).toContain("AlertButton");
  });
});
