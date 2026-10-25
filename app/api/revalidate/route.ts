import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import { revalidateBodySchema } from "@/lib/api/contracts";
import { assertSameOrigin, parseJson } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { PRICES_TAG } from "@/lib/services/underlying-prices.supabase";

export const runtime = "nodejs";

function authorized(h: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const got = h?.startsWith("Bearer ") ? h.slice(7) : "";
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  return secret.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "cron");
  if (limited) return limited;
  if (!process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false, error: "Revalidación no configurada." }, { status: 503 });
  }
  if (!authorized(req.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  // Exenta de Origin (la llama GitHub Actions). parseJson acepta cuerpo vacío.
  assertSameOrigin(req);
  await parseJson(req, revalidateBodySchema);
  revalidateTag(PRICES_TAG, "max");
  return Response.json({ ok: true, tags: [PRICES_TAG] });
}
