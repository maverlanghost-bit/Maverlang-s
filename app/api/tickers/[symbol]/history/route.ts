import { NextResponse } from "next/server";

import {
  HISTORY_CACHE_MISS,
  historyCacheControl,
  historyFields,
  historyParamsSchema,
  historyQuerySchema,
  historyResponseSchema,
  parseContract,
} from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput, requireVisibleSymbol } from "@/lib/api/handler";
import { DomainError, ok } from "@/lib/api/result";
import { historyWithSource } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** La serie corta antes por su cuenta. Esto evita un cuelgue de plataforma. */
export const maxDuration = 10;

function historyJson(fields: ReturnType<typeof historyFields>, cacheControl: string) {
  const payload = readOutput(historyResponseSchema, fields);
  return NextResponse.json(ok(payload), {
    status: 200,
    headers: {
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    try {
      const params = parseContract(historyParamsSchema, await ctx.params);
      const { range } = parseQuery(req, historyQuerySchema);
      const symbol = await requireVisibleSymbol(params.symbol);
      const { points, source } = await callService(req, () => historyWithSource(symbol, range));
      const fields = historyFields(points, source);
      // Con datos: s-maxage=60 + SWR. Vacío, mock o error: como máximo 30 s y sin CDN.
      return historyJson(fields, historyCacheControl(fields));
    } catch (error) {
      if (error instanceof DomainError) throw error;
      console.error("history", error);
      const fields = historyFields([], "mock");
      return historyJson(fields, HISTORY_CACHE_MISS);
    }
  });
}
