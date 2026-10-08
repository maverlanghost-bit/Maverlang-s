import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

import {
  DomainError,
  errorMessage,
  failFrom,
  ok,
  resultStatus,
  type ApiErrorCode,
  type ApiResult,
} from "@/lib/api/result";
import { requestAccountMode } from "@/lib/account/server";
import { DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { serverEnv } from "@/lib/env";
import { withMockError } from "@/lib/mocks/latency";
import type { Services } from "@/lib/services";
import { isOfficialMint, tradableTicker } from "@/lib/solana/allowlist";

/** `runtime` se declara en cada `route.ts`: Next sólo lo lee ahí, como literal. */
export type CacheMode = "no-store" | "hour" | "private" | "short";

const CACHE_CONTROL: Record<CacheMode, string> = {
  "no-store": "no-store",
  hour: "public, max-age=3600, s-maxage=3600",
  private: "private, no-store",
  /** Respuestas de búsqueda del mercado: 30 s en el navegador, 60 s en el CDN. */
  short: "public, max-age=30, s-maxage=60",
};

export type Session = { userId: string; walletAddress: string | null };

export function jsonResult<T>(result: ApiResult<T>, cache: CacheMode): NextResponse {
  return NextResponse.json(result, {
    status: resultStatus(result),
    headers: { "cache-control": CACHE_CONTROL[cache], "x-content-type-options": "nosniff" },
  });
}

/** zod ya corrió. `DomainError` sale como `fail(code)`; el resto, `INTERNAL`. */
/** Si `run` devuelve un `Response` (p. ej. la 429 de `withRateLimit`), sale tal cual. */
/**
 * Atrapa todo: en la respuesta sólo viajan `code`, un mensaje humano en
 * español y `requestId`. El detalle (stack, mensajes de Supabase, Jupiter o
 * Postgres) queda en el log del servidor junto al `requestId`.
 */
export async function handle<T>(cache: CacheMode, run: () => Promise<T | Response>): Promise<Response> {
  try {
    const data = await run();
    if (data instanceof Response) return data;
    return jsonResult(ok(data), cache);
  } catch (error) {
    const requestId = newRequestId();
    const code: ApiErrorCode = error instanceof DomainError ? error.code : "INTERNAL";
    const failed = failFrom(error);
    // INTERNAL siempre genérico: nunca sale `error.message` crudo de terceros.
    const message =
      code === "INTERNAL" ? errorMessage("INTERNAL") : failed.ok ? errorMessage(code) : failed.error.message;
    logApiError(requestId, code, error);
    return errorResult(code, message, requestId, cache);
  }
}

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

function logApiError(requestId: string, code: ApiErrorCode, error: unknown): void {
  const stack = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`api ${requestId} ${code}: ${stack}`);
}

function errorResult(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  cache: CacheMode,
): NextResponse {
  const body: ApiResult<never> = { ok: false, error: { code, message }, requestId };
  return NextResponse.json(body, {
    status: resultStatus(body),
    headers: {
      "cache-control": CACHE_CONTROL[cache],
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
    },
  });
}

/** Tamaño máximo del cuerpo JSON: 16 KB. Encima → 413 `PAYLOAD_TOO_LARGE`. */
export const MAX_BODY_BYTES = 16_384;

function validationFieldsMessage(error: ZodError): string {
  const fields: string[] = [];
  for (const issue of error.issues) {
    // Campos extra (`.strict()`): zod los trae en `keys`, sin `path`.
    if (issue.code === "unrecognized_keys") {
      const keys = (issue as { keys?: unknown }).keys;
      if (Array.isArray(keys)) {
        for (const key of keys) if (typeof key === "string") fields.push(key);
      }
      continue;
    }
    if (issue.path.length > 0) fields.push(String(issue.path[0]));
  }
  const unique = [...new Set(fields)].sort();
  // Sin eco de valores: sólo los nombres de los campos.
  if (unique.length === 0) return "Los datos no son válidos.";
  return `Los datos no son válidos: revisa ${unique.join(", ")}.`;
}

/**
 * Lee el cuerpo, lo topa en `maxBytes` (413), lo parsea y lo valida con zod
 * (400 `VALIDATION` con la lista de campos, sin eco de valores).
 * Los esquemas de `contracts.ts` usan `.strict()`: rechazan campos extra.
 */
export async function parseJson<T>(
  req: Request,
  schema: ZodType<T>,
  options: { maxBytes?: number } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new DomainError("PAYLOAD_TOO_LARGE");
  }
  let raw: unknown;
  try {
    raw = text.trim() === "" ? undefined : (JSON.parse(text) as unknown);
  } catch {
    throw new DomainError("VALIDATION", "El cuerpo no es JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new DomainError("VALIDATION", validationFieldsMessage(parsed.error));
  return parsed.data;
}

/**
 * Valida la query string con zod (400 `VALIDATION` con la lista de campos).
 * `mockError` lo lee `callService`, no el esquema: se excluye antes.
 */
export function parseQuery<T>(input: Request | URL | string, schema: ZodType<T>): T {
  const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key === "mockError") return;
    raw[key] = value;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new DomainError("VALIDATION", validationFieldsMessage(parsed.error));
  return parsed.data;
}

/** Rutas exentas de `Origin`: el webhook (firma propia) y los crons (token). */
const ORIGIN_EXEMPT_PREFIXES = ["/api/onramp/webhook", "/api/cron/"] as const;

export function isOriginExempt(pathname: string): boolean {
  return ORIGIN_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function siteOriginOf(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF barato (M56): en métodos que cambian estado, `Origin` (o `Referer` si
 * falta) debe coincidir con `NEXT_PUBLIC_SITE_URL` o con el host pedido
 * (`x-forwarded-host`, `host` o el host de `req.url`: `new URL(req.url).host`
 * no es confiable tras proxies, así que se acepta cualquiera de los tres).
 * Sin ambos, o con otro origen → 403 `FORBIDDEN_ORIGIN`. GET/HEAD/OPTIONS y
 * las exentas (`/api/onramp/webhook`, `/api/cron/*`) pasan.
 */
export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const url = new URL(req.url);
  if (isOriginExempt(url.pathname)) return;
  const candidate = req.headers.get("origin") ?? req.headers.get("referer");
  if (!candidate) throw new DomainError("FORBIDDEN_ORIGIN");
  let candidateUrl: URL;
  try {
    candidateUrl = new URL(candidate);
  } catch {
    throw new DomainError("FORBIDDEN_ORIGIN");
  }
  if (candidateUrl.origin === siteOriginOf()) return;
  const allowedHosts = new Set<string>();
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) allowedHosts.add(forwarded.toLowerCase());
  const hostHeader = req.headers.get("host")?.trim();
  if (hostHeader) allowedHosts.add(hostHeader.toLowerCase());
  allowedHosts.add(url.host.toLowerCase());
  if (allowedHosts.has(candidateUrl.host.toLowerCase())) return;
  throw new DomainError("FORBIDDEN_ORIGIN");
}

export function readOutput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new DomainError("INTERNAL");
  return parsed.data;
}

/** Alias anterior de `parseQuery` (M56): las rutas usan el nombre nuevo. */
export function queryOf<T>(schema: ZodType<T>, req: Request): T {
  return parseQuery(req, schema);
}

/** Alias anterior de `parseJson` (M56): las rutas usan el nombre nuevo. */
export async function bodyOf<T>(schema: ZodType<T>, req: Request): Promise<T> {
  return parseJson(req, schema);
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

/**
 * En modo supabase, la ruta exige un usuario verificado con `getUser`.
 * En mock no cambia: cotizar y armar siguen sin sesión.
 */
export async function requireSupabaseUser(services: Services, req: Request): Promise<void> {
  if (!isSupabaseAuth()) return;
  await requireSession(services, req);
}

/**
 * M36: con AUTH_MODE=supabase y la cookie `mv_account=demo` (por defecto),
 * la cartera y las órdenes demo son por usuario en Supabase.
 * Con `mv_account=real`, la cuenta real todavía no opera: estado vacío.
 * Con AUTH_MODE=mock (tests/e2e) no cambia nada: sigue el mock en memoria.
 */
export function isUserDemoRequest(req: Request): boolean {
  return isSupabaseAuth() && requestAccountMode(req) === "demo";
}

/** Supabase + cuenta real: todavía sin movimientos. Las rutas devuelven vacío. */
export function isRealAccountRequest(req: Request): boolean {
  return isSupabaseAuth() && requestAccountMode(req) === "real";
}

/**
 * Dinero real (M46). `true` sólo con `REAL_TRADING_READY=true` (default
 * `false` en `lib/env.ts`). Con `false`, las rutas de dinero real responden
 * 503 `REAL_DISABLED` sin tocar servicios externos; la demo sigue igual.
 */
export function isRealTradingEnabled(): boolean {
  return serverEnv.REAL_TRADING_READY === true;
}

/** 503 `REAL_DISABLED` mientras `REAL_TRADING_READY` no sea `true`. */
export function assertRealTradingEnabled(): void {
  if (!isRealTradingEnabled()) throw new DomainError("REAL_DISABLED");
}

/**
 * Crons internos (M46; la ruta de sync llega en M50). Compara `CRON_SECRET`
 * (header `Authorization: Bearer <secreto>`) en tiempo constante. Sin secreto
 * configurado, o si no coincide → 401: nunca se ejecuta sin el token.
 */
export function requireCronSecret(req: Request): void {
  const expected = serverEnv.CRON_SECRET?.trim() ?? "";
  if (!expected) throw new DomainError("UNAUTHORIZED");
  const header = req.headers.get("authorization")?.trim() ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    throw new DomainError("UNAUTHORIZED");
  }
}

export function requireWallet(session: Session): string {
  if (session.walletAddress) return session.walletAddress;
  // La cartera real no está asociada al usuario. Con datos mock se sirve la demo.
  const dataMode = process.env.DATA_MODE?.trim() || "mock";
  if (dataMode !== "live" && isSupabaseAuth()) return DEMO_WALLET_ADDRESS;
  throw new DomainError("VALIDATION", "Falta la billetera.");
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
