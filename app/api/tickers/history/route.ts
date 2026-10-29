import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HISTORY_CACHE_DATA,
  HISTORY_CACHE_MISS,
  historyCacheControl,
  historyFields,
  rangeSchema,
} from "@/lib/api/contracts";
import { callService, handle, parseQuery, requireVisibleSymbol } from "@/lib/api/handler";
import { DomainError, ok } from "@/lib/api/result";
import { CATALOG_SYMBOL } from "@/lib/catalog/symbol";
import { historiesWithSource } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const batchHistoryQuerySchema = z
  .object({
    symbols: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0),
      )
      .refine((list) => list.length > 0 && list.length <= 50, "Como máximo 50 símbolos por llamada.")
      .refine((list) => list.every((symbol) => CATALOG_SYMBOL.test(symbol)), {
        message: "Símbolo inválido.",
      }),
    range: rangeSchema.default("1W"),
  })
  .strict();

/**
 * Sparklines del mercado y de la cartera: una petición para el lote.
 * Misma serie que `/api/tickers/:symbol/history`.
 */
export function GET(req: Request) {
  return handle("no-store", async () => {
    try {
      const { symbols, range } = parseQuery(req, batchHistoryQuerySchema);
      const unique: string[] = [];
      const seen = new Set<string>();
      for (const symbol of symbols) {
        const key = symbol.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(symbol);
      }
      const visible: string[] = [];
      for (const symbol of unique) {
        try {
          visible.push(await requireVisibleSymbol(symbol));
        } catch (error) {
          if (error instanceof DomainError && error.code === "MINT_NOT_ALLOWED") continue;
          throw error;
        }
      }
      const rows = await callService(req, () => historiesWithSource(visible, range));
      const series = rows.map((row) => ({ symbol: row.symbol, ...historyFields(row.points, row.source) }));
      const cacheable = series.some((row) => historyCacheControl(row) === HISTORY_CACHE_DATA);
      return NextResponse.json(ok({ series }), {
        status: 200,
        headers: {
          "cache-control": cacheable ? HISTORY_CACHE_DATA : HISTORY_CACHE_MISS,
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      console.error("histories", error);
      return NextResponse.json(ok({ series: [] }), {
        status: 200,
        headers: {
          "cache-control": HISTORY_CACHE_MISS,
          "x-content-type-options": "nosniff",
        },
      });
    }
  });
}
