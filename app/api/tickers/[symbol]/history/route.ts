import { NextResponse } from "next/server";

import { historyParamsSchema, historyQuerySchema, historyResponseSchema, parseContract } from "@/lib/api/contracts";
import { callService, handle, parseQuery, readOutput, requireVisibleSymbol } from "@/lib/api/handler";
import { ok } from "@/lib/api/result";
import { historyWithSource } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOSES_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    const params = parseContract(historyParamsSchema, await ctx.params);
    const { range } = parseQuery(req, historyQuerySchema);
    const symbol = await requireVisibleSymbol(params.symbol);
    const { points, source } = await callService(req, () => historyWithSource(symbol, range));
    const payload = readOutput(historyResponseSchema, {
      points,
      real: points.length >= 2 && source !== "mock",
      source,
    });
    if (source !== "closes") return payload;
    return NextResponse.json(ok(payload), {
      status: 200,
      headers: {
        "cache-control": CLOSES_CACHE,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
