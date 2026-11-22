import { NextResponse } from "next/server";
import { z } from "zod";

import { shareSigningAvailable, signShareCard } from "@/lib/ai/share-signing";
import { loadPortfolioForAssistant } from "@/lib/ai/portfolio";
import { parseQuery, requireSession } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { withRateLimit } from "@/lib/security/rate-limit";
import { resolvePublicAsset } from "@/lib/seo/public-catalog";
import { getServices } from "@/lib/services";
import { parseSharePct, shareCardPath } from "@/lib/share-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shareCardQuerySchema = z
  .object({ id: z.string().trim().min(1).max(64) })
  .strict();

const HEADERS ={ "cache-control": "private, no-store", "x-content-type-options": "nosniff" } as const;

/**
 * WEB-5: el porcentaje de la tarjeta sólo sale de la cartera real de la sesión
 * y viaja firmado. Sin posición, sin P&L o sin secreto de firma, el enlace
 * devuelto es el de la tarjeta sin porcentaje.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const session = await requireSession(getServices(), req);
    const limited = await withRateLimit(req, "me", [session.userId]);
    if (limited) return limited;

    const { id } = parseQuery(req, shareCardQuerySchema);
    const asset = await resolvePublicAsset(id).catch(() => null);
    if (!asset) {
      return NextResponse.json({ error: "Activo no encontrado." }, { status: 404, headers: HEADERS });
    }

    let pct: number | null = null;
    if (shareSigningAvailable()) {
      const load = await loadPortfolioForAssistant(req);
      if (load.kind === "ok") {
        const position = load.portfolio.positions.find(
          (item) => String(item.symbol).toLowerCase() === asset.symbol.toLowerCase(),
        );
        if (position && typeof position.pnlPct === "number") {
          pct = parseSharePct(String(position.pnlPct));
        }
      }
    }

    const sig = pct === null ? null : signShareCard(asset.symbol, pct);
    const signedPct = sig ? pct : null;
    return NextResponse.json(
      { path: shareCardPath(id, signedPct, sig), pct: signedPct },
      { status: 200, headers: HEADERS },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Inicia sesión para compartir." }, { status: 401, headers: HEADERS });
    }
    if (error instanceof DomainError && error.code === "VALIDATION") {
      return NextResponse.json({ error: "Activo no encontrado." }, { status: 404, headers: HEADERS });
    }
    console.error("share-card unexpected");
    return NextResponse.json({ error: "No pudimos preparar la tarjeta." }, { status: 500, headers: HEADERS });
  }
}
