import { NextResponse } from "next/server";

import { historyParamsSchema, parseContract } from "@/lib/api/contracts";
import { callService, handle, requireVisibleSymbol } from "@/lib/api/handler";
import { DomainError, ok } from "@/lib/api/result";
import { readCompanyForSymbol } from "@/lib/services/company-facts.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Dos lecturas indexadas. Si la base no responde, la ficha no espera. */
export const maxDuration = 10;

const CACHE_HIT = "public, max-age=3600, s-maxage=3600";
const COMPANY_TIMEOUT_MS = 2_500;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new DomainError("UPSTREAM")), ms);
  });
  void work.catch(() => undefined);
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Ficha pública de la SEC. El símbolo se resuelve como el historial
 * (`requireVisibleSymbol`). Sin fila en `company_facts` → 404, sin cifra inventada.
 * Con datos, el CDN guarda una hora (`s-maxage=3600`).
 */
export function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  return handle("no-store", async () => {
    const params = parseContract(historyParamsSchema, await ctx.params);
    const symbol = await requireVisibleSymbol(params.symbol);
    const view = await callService(req, () => within(readCompanyForSymbol(symbol), COMPANY_TIMEOUT_MS));
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
