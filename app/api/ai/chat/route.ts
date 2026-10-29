import { aiMessages } from "@/content/i18n/extra-b";
import { symbolSchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { takeAiQuota } from "@/lib/ai/limit";
import { runChat } from "@/lib/ai/run-chat";
import { AI_MAX_BODY_BYTES, aiChatRequestSchema } from "@/lib/ai/schema";
import type { AiChatResponse } from "@/lib/ai/types";
import { readXaiSettings, XaiNotConfiguredError, XaiUpstreamError } from "@/lib/ai/xai";
import { ipOfRequest } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 4 rondas de tools × 25 s, con margen para el catálogo. */
export const maxDuration = 120;

const copy = aiMessages.esCL;
const bodySchema = aiChatRequestSchema(symbolSchema.max(16));

function aiResponse(body: AiChatResponse, status: number, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(body, { status, headers });
}

async function subjectOf(req: Request): Promise<string> {
  try {
    const session = await getServices().auth.getSession(req);
    if (session?.userId) return session.userId;
  } catch {
    console.error("ai chat session");
  }
  return ipOfRequest(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > AI_MAX_BODY_BYTES) {
      return aiResponse({ ok: false, error: "bad_request", message: copy.tooLarge }, 413);
    }
    const body = await parseJson(req, bodySchema, { maxBytes: AI_MAX_BODY_BYTES });
    if (!readXaiSettings().apiKey) {
      return aiResponse({ ok: false, error: "not_configured", message: copy.notConfigured }, 503);
    }
    const quota = await takeAiQuota(await subjectOf(req));
    if (!quota.ok) {
      const retry = String(Math.max(1, Math.ceil(quota.resetMs / 1000)));
      return aiResponse({ ok: false, error: "rate_limited", message: copy.rateLimited }, 429, {
        "Retry-After": retry,
        "X-RateLimit-Remaining": "0",
      });
    }
    const result = await runChat({
      messages: body.messages,
      image: body.image,
      context: body.context,
      req,
    });
    return aiResponse({ ok: true, text: result.text, widgets: result.widgets }, 200);
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "FORBIDDEN_ORIGIN") {
        return aiResponse({ ok: false, error: "bad_request", message: copy.badOrigin }, 403);
      }
      if (error.code === "PAYLOAD_TOO_LARGE") {
        return aiResponse({ ok: false, error: "bad_request", message: copy.tooLarge }, 413);
      }
      if (error.code === "VALIDATION") {
        return aiResponse({ ok: false, error: "bad_request", message: copy.badRequest }, 400);
      }
      console.error(`ai chat ${error.code}`);
      return aiResponse({ ok: false, error: "upstream", message: copy.upstream }, 502);
    }
    if (error instanceof XaiNotConfiguredError) {
      return aiResponse({ ok: false, error: "not_configured", message: copy.notConfigured }, 503);
    }
    if (error instanceof XaiUpstreamError) {
      console.error("ai chat upstream");
      return aiResponse({ ok: false, error: "upstream", message: error.message }, 502);
    }
    console.error("ai chat unexpected");
    return aiResponse({ ok: false, error: "upstream", message: copy.upstream }, 502);
  }
}
