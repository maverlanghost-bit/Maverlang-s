import { NextResponse } from "next/server";

import { shareSigningAvailable, verifyAssistantReply } from "@/lib/ai/share-signing";
import {
  ShareLimitError,
  ShareStoreUnavailableError,
  createSharedChat,
  getSharedChat,
  revokeSharedChat,
  shareStoreAvailable,
} from "@/lib/ai/share-store";
import { aiShareCreateSchema, aiShareQuerySchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson, parseQuery, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { apiOperateBlock } from "@/lib/compliance/real-quote";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SHARE_BODY_BYTES = 256 * 1024;

const UNVERIFIED_REPLY_MESSAGE =
  "No pudimos verificar que una de las respuestas fue emitida por Maverlang AI. Vuelve a generarla e inténtalo de nuevo.";
const UNAVAILABLE_MESSAGE = "Compartir conversaciones no está disponible por ahora. Inténtalo más tarde.";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
} as const;

export async function POST(req: Request): Promise<Response> {
  const geo = apiOperateBlock(req);
  if (geo) return geo;
  try {
    assertSameOrigin(req);
    const session = await requireSession(getServices(), req);
    const limited = await withRateLimit(req, "aiShare", [session.userId]);
    if (limited) return limited;
    if (!shareStoreAvailable() || !shareSigningAvailable()) {
      return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503, headers: PRIVATE_HEADERS });
    }
    const body = await parseJson(req, aiShareCreateSchema, {
      maxBytes: MAX_SHARE_BODY_BYTES,
    });

    // P0-5: sólo se publican respuestas del asistente que el servidor firmó para esta cuenta.
    for (const message of body.messages) {
      if (message.role === "assistant" && !verifyAssistantReply(session.userId, message.text, message.sig)) {
        return NextResponse.json(
          { error: UNVERIFIED_REPLY_MESSAGE },
          { status: 400, headers: PRIVATE_HEADERS },
        );
      }
    }

    const chat = await createSharedChat({
      title: body.title,
      messages: body.messages.map((message) => ({ role: message.role, text: message.text })),
      ownerId: session.userId,
    });

    return NextResponse.json(
      {
        id: chat.id,
        url: `/app/asistente/compartido/${chat.id}`,
      },
      { status: 201, headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return shareErrorResponse(error, "No pudimos generar el enlace compartido.");
  }
}

function shareErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof DomainError) {
    const status =
      error.code === "UNAUTHORIZED"
        ? 401
        : error.code === "FORBIDDEN_ORIGIN"
          ? 403
          : error.code === "PAYLOAD_TOO_LARGE"
            ? 413
            : 400;
    const message =
      error.code === "UNAUTHORIZED"
        ? "Inicia sesión para compartir conversaciones."
        : error.message || "Solicitud inválida.";
    return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS });
  }
  if (error instanceof ShareLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429, headers: PRIVATE_HEADERS });
  }
  if (error instanceof ShareStoreUnavailableError) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503, headers: PRIVATE_HEADERS });
  }
  console.error("ai share unexpected");
  return NextResponse.json({ error: fallback }, { status: 500, headers: PRIVATE_HEADERS });
}

/** Revoca un enlace propio: queda como "no encontrado" para cualquiera. */
export async function DELETE(req: Request): Promise<Response> {
  const geo = apiOperateBlock(req);
  if (geo) return geo;
  try {
    assertSameOrigin(req);
    const session = await requireSession(getServices(), req);
    const limited = await withRateLimit(req, "me", [session.userId]);
    if (limited) return limited;
    const { id } = parseQuery(req, aiShareQuerySchema);
    const revoked = await revokeSharedChat(id, session.userId);
    if (!revoked) {
      return NextResponse.json(
        { error: "Conversación no encontrada." },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json({ ok: true }, { status: 200, headers: PRIVATE_HEADERS });
  } catch (error) {
    return shareErrorResponse(error, "No pudimos revocar el enlace compartido.");
  }
}

export async function GET(req: Request): Promise<Response> {
  const limited = await withRateLimit(req, "publicGet");
  if (limited) return limited;
  let id: string;
  try {
    ({ id } = parseQuery(req, aiShareQuerySchema));
  } catch {
    return NextResponse.json(
      { error: "Conversación no encontrada." },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const chat = await getSharedChat(id);
    if (!chat) {
      return NextResponse.json(
        { error: "Conversación no encontrada." },
        { status: 404, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      { chat },
      {
        status: 200,
        headers: {
          // Un enlace revocado debe dejar de servirse de inmediato.
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch {
    console.error("ai share GET unexpected");
    return NextResponse.json(
      { error: "No pudimos cargar la conversación compartida." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}
