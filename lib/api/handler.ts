import "server-only";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { parseContract } from "@/lib/api/contracts";
import { DomainError, failFrom, ok, resultStatus, type ApiResult } from "@/lib/api/result";
import { withMockError } from "@/lib/mocks/latency";
import type { Services } from "@/lib/services";
import { isOfficialMint, tradableTicker } from "@/lib/solana/allowlist";

/** `runtime` se declara en cada `route.ts`: Next sólo lo lee ahí, como literal. */
export type CacheMode = "no-store" | "hour" | "private";

const CACHE_CONTROL: Record<CacheMode, string> = {
  "no-store": "no-store",
  hour: "public, max-age=3600, s-maxage=3600",
  private: "private, no-store",
};

export type Session = { userId: string; walletAddress: string | null };

export function jsonResult<T>(result: ApiResult<T>, cache: CacheMode): NextResponse {
  return NextResponse.json(result, {
    status: resultStatus(result),
    headers: { "cache-control": CACHE_CONTROL[cache] },
  });
}

/** zod ya corrió. `DomainError` sale como `fail(code)`; el resto, `INTERNAL`. */
export async function handle<T>(cache: CacheMode, run: () => Promise<T>): Promise<NextResponse> {
  try {
    return jsonResult(ok(await run()), cache);
  } catch (error) {
    return jsonResult(failFrom(error), cache);
  }
}

export function readOutput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new DomainError("INTERNAL");
  return parsed.data;
}

export function queryOf<T>(schema: ZodType<T>, req: Request): T {
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key === "mockError") return;
    raw[key] = value;
  });
  return parseContract(schema, raw);
}

export async function bodyOf<T>(schema: ZodType<T>, req: Request): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new DomainError("VALIDATION", "El cuerpo no es JSON.");
  }
  return parseContract(schema, raw);
}

/** `?mockError=` lo aplica el servicio, no la sesión. */
export function callService<T>(req: Request, run: () => Promise<T>): Promise<T> {
  const code = new URL(req.url).searchParams.get("mockError");
  return withMockError(code, run);
}

export async function requireSession(services: Services, req: Request): Promise<Session> {
  const session = await services.auth.getSession(req);
  if (!session) throw new DomainError("UNAUTHORIZED");
  return session;
}

export function requireWallet(session: Session): string {
  if (!session.walletAddress) throw new DomainError("VALIDATION", "Falta la billetera.");
  return session.walletAddress;
}

/** Fuera del allowlist operable (enabled + mint oficial) → MINT_NOT_ALLOWED. */
export function requireSymbol(symbol: string): string {
  const ticker = tradableTicker(symbol);
  if (!ticker) throw new DomainError("MINT_NOT_ALLOWED");
  return ticker.symbol;
}

export function requireMint(mint: string): string {
  if (!isOfficialMint(mint)) throw new DomainError("MINT_NOT_ALLOWED");
  return mint;
}
