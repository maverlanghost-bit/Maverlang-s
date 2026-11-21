import { NextResponse } from "next/server";

import {
  createSharedChat,
  getSharedChat,
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
    const limited = await withRateLimit(req, "ai", [session.userId]);
    if (limited) return limited;
    const body = await parseJson(req, aiShareCreateSchema, {
      maxBytes: MAX_SHARE_BODY_BYTES,
    });

    const chat = await createSharedChat({
      title: body.title,
      messages: body.messages,
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
      return NextResponse.json(
        { error: message },
        { status, headers: PRIVATE_HEADERS },
      );
    }
    console.error("ai share POST unexpected");
    return NextResponse.json(
      { error: "No pudimos generar el enlace compartido." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
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
          "cache-control": "public, max-age=60",
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
