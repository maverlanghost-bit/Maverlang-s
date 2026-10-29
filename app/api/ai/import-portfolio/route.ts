import { tradableSymbolSchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import {
  MAX_IMPORT_BODY_BYTES,
  hasXaiKey,
  importPortfolioFromImage,
  importPortfolioRequestSchema,
  inspectImageDataUrl,
  rateSubject,
  reserveAiCall,
  type ImportPreviewPosition,
  type VisionChatResponse,
} from "@/lib/ai/vision-import";
import { NOT_CONFIGURED_MESSAGE, importarText } from "@/content/i18n/extra-importar";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/import-portfolio
 * Lee una foto (JPG o PNG, hasta 4 MB) y devuelve un widget import-preview.
 * No guarda la foto ni las filas. Guardar es un paso aparte, en el cliente.
 */

const NO_STORE = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};

export async function POST(req: Request): Promise<Response> {
  const copy = importarText(languageOf(req));
  try {
    assertSameOrigin(req);
    const body = await parseJson(req, importPortfolioRequestSchema, { maxBytes: MAX_IMPORT_BODY_BYTES });
    if (!hasXaiKey()) {
      return send({ ok: false, error: "not_configured", message: NOT_CONFIGURED_MESSAGE }, 503);
    }
    const image = inspectImageDataUrl(body.image);
    if (!image.ok) return send({ ok: false, error: "bad_request", message: copy.badImage }, 400);
    const slot = await reserveAiCall(rateSubject(await userIdOf(req), req));
    if (!slot.ok) {
      return send({ ok: false, error: "rate_limited", message: copy.rateLimited }, 429, {
        "retry-after": String(Math.max(1, Math.ceil(slot.resetMs / 1000))),
      });
    }
    // La foto viaja a xAI y no se escribe en disco, base ni logs.
    const result = guardMatched(
      await importPortfolioFromImage({
        image: image.dataUrl,
        language: languageOf(req),
      }),
    );
    return send(result, result.ok ? 200 : statusFor(result.error));
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : error.code === "FORBIDDEN_ORIGIN" ? 403 : 400;
      const message = error.code === "FORBIDDEN_ORIGIN" ? copy.badOrigin : copy.badImage;
      return send({ ok: false, error: "bad_request", message }, status);
    }
    console.error("api import-portfolio");
    return send({ ok: false, error: "upstream", message: copy.upstream }, 502);
  }
}

function send(body: VisionChatResponse, status: number, extra?: Record<string, string>): Response {
  const headers = new Headers(NO_STORE);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return Response.json(body, { status, headers });
}

function statusFor(error: "not_configured" | "rate_limited" | "bad_request" | "upstream"): number {
  if (error === "not_configured") return 503;
  if (error === "rate_limited") return 429;
  if (error === "bad_request") return 400;
  return 502;
}

function languageOf(req: Request): "es-CL" | "en" {
  const header = req.headers.get("accept-language") ?? "";
  return /^\s*en\b/i.test(header) ? "en" : "es-CL";
}

async function userIdOf(req: Request): Promise<string | null> {
  try {
    const session = await getServices().auth.getSession(req);
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

function guardMatched(body: VisionChatResponse): VisionChatResponse {
  if (!body.ok) return body;
  return {
    ...body,
    widgets: body.widgets.map((widget) => ({
      ...widget,
      positions: widget.positions.map((position) => confirmSymbol(position)),
    })),
  };
}

function confirmSymbol(position: ImportPreviewPosition): ImportPreviewPosition {
  if (!position.matched) return position;
  const parsed = tradableSymbolSchema.safeParse(position.ticker);
  if (!parsed.success) return { ...position, matched: false };
  return { ...position, ticker: parsed.data };
}
