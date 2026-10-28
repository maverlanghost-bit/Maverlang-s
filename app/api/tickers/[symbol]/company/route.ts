import { NextResponse } from "next/server";

import { historyParamsSchema, parseContract } from "@/lib/api/contracts";
import { callService, handle, requireVisibleSymbol } from "@/lib/api/handler";
import { DomainError, ok } from "@/lib/api/result";
import { readCompanyForSymbol } from "@/lib/services/company-facts.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HIT = "public, max-age=3600, s-maxage=3600";

/**
 * Ficha pública de la SEC. El símbolo se resuelve como el historial
 * (`requireVisibleSymbol`). Sin fila en `company_facts` → 404, sin cifra inventada.
 * Con datos, el CDN guarda una hora (`s-maxage=3600`).
 */
export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    const params = parseContract(historyParamsSchema, await ctx.params);
    const symbol = await requireVisibleSymbol(params.symbol);
    const view = await callService(req, () => readCompanyForSymbol(symbol));
    if (!view) throw new DomainError("NOT_FOUND");
    return NextResponse.json(ok(view), {
      status: 200,
      headers: {
        "cache-control": CACHE_HIT,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
