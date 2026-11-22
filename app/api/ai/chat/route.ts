import { stripInlineNotice } from "@/components/ai/model";
import { aiMessages } from "@/content/i18n/extra-b";
import { symbolSchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { takeAiQuota } from "@/lib/ai/limit";
import { runChat } from "@/lib/ai/run-chat";
import { signAssistantReply } from "@/lib/ai/share-signing";
import { AI_MAX_BODY_BYTES, aiChatRequestSchema, type AiChatBody } from "@/lib/ai/schema";
import type { AiChatResponse } from "@/lib/ai/types";
import { readXaiSettings, XaiNotConfiguredError, XaiUpstreamError } from "@/lib/ai/xai";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 4 rondas de tools × 25 s, o 1 ronda + 60 s de stream, con margen para el catálogo. */
export const maxDuration = 120;

const copy = aiMessages.esCL;
const bodySchema = aiChatRequestSchema(symbolSchema.max(16));

function aiResponse(body: AiChatResponse, status: number, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(body, { status, headers });
}

/** `accept` con `text/event-stream` pide el protocolo SSE de §1.4. */
function wantsStream(req: Request): boolean {
  return (req.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");
}

type StreamError = { error: "bad_request" | "not_configured" | "upstream"; message: string };

/** Mismo criterio que el `catch` de JSON, para el evento `error` del SSE. */
function streamFailure(error: unknown): StreamError {
  if (error instanceof DomainError) {
    if (error.code === "FORBIDDEN_ORIGIN") return { error: "bad_request", message: copy.badOrigin };
    if (error.code === "PAYLOAD_TOO_LARGE") return { error: "bad_request", message: copy.tooLarge };
    if (error.code === "VALIDATION") return { error: "bad_request", message: copy.badRequest };
    return { error: "upstream", message: copy.upstream };
  }
  if (error instanceof XaiNotConfiguredError) return { error: "not_configured", message: copy.notConfigured };
  if (error instanceof XaiUpstreamError) return { error: "upstream", message: error.message };
  return { error: "upstream", message: copy.upstream };
}

/**
 * SSE de §1.4: `delta` por cada trozo y un único `done` (o `error`) al final.
 * Cuando esto corre ya se validaron geo, origen, tamaño, cuerpo, clave y cupo,
 * así que el estado es 200 y los fallos viajan como evento `error`. Nunca se
 * copia el cuerpo del proveedor.
 */
/** Firma lo que el cliente va a guardar (sin el aviso inline) para poder compartirlo. */
function replySig(userId: string, text: string): string | undefined {
  return signAssistantReply(userId, stripInlineNotice(text)) ?? undefined;
}

function streamResponse(req: Request, body: AiChatBody, userId: string): Response {
  const encoder = new TextEncoder();
  const events = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: unknown): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await runChat(
          { messages: body.messages, image: body.image, context: body.context, req },
          undefined,
          undefined,
          { onDelta: (chunk) => send({ type: "delta", text: chunk }) },
        );
        send({
          type: "done",
          ok: true,
          text: result.text,
          widgets: result.widgets,
          sig: replySig(userId, result.text),
        });
      } catch (error) {
        const failure = streamFailure(error);
        console.error(`ai chat stream ${failure.error}`);
        send({ type: "error", error: failure.error, message: failure.message });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // El cliente ya cerró la conexión.
        }
      }
    },
  });
  return new Response(events, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-accel-buffering": "no",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const geo = apiOperateBlock(req);
  if (geo) return geo;
  const stream = wantsStream(req);
  try {
    assertSameOrigin(req);
    const session = await requireSession(getServices(), req);
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > AI_MAX_BODY_BYTES) {
      return aiResponse({ ok: false, error: "bad_request", message: copy.tooLarge }, 413);
    }
    const body = await parseJson(req, bodySchema, { maxBytes: AI_MAX_BODY_BYTES });
    if (!readXaiSettings().apiKey) {
      return aiResponse({ ok: false, error: "not_configured", message: copy.notConfigured }, 503);
    }
    const quota = await takeAiQuota(session.userId, { image: body.image !== undefined });
    if (!quota.ok) {
      if (quota.unavailable) {
        return aiResponse({ ok: false, error: "upstream", message: copy.upstream }, 503, {
          "Retry-After": "30",
        });
      }
      const retry = String(Math.max(1, Math.ceil(quota.resetMs / 1000)));
      return aiResponse({ ok: false, error: "rate_limited", message: copy.rateLimited }, 429, {
        "Retry-After": retry,
        "X-RateLimit-Remaining": "0",
      });
    }
    if (stream) return streamResponse(req, body, session.userId);
    const result = await runChat({
      messages: body.messages,
      image: body.image,
      context: body.context,
      req,
    });
    return aiResponse(
      { ok: true, text: result.text, widgets: result.widgets, sig: replySig(session.userId, result.text) },
      200,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "UNAUTHORIZED") {
        return aiResponse({ ok: false, error: "bad_request", message: "Inicia sesión para usar el asistente." }, 401);
      }
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
