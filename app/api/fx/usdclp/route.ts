import { NextResponse } from "next/server";

import { fxRateSchema } from "@/lib/api/contracts";
import { callService, handle, readOutput } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { ok } from "@/lib/api/result";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** El cliente refresca cada 5 min. El CDN puede servir la copia ese mismo rato. */
const FX_CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=300";

export function GET(req: Request) {
  return handle("no-store", async () => {
    const limited = await withRateLimit(req, "publicGet");
    if (limited) return limited;
    const services = getServices();
    const data = await callService(req, () => services.prices.fx());
    const payload = readOutput(fxRateSchema, data);
    return NextResponse.json(ok(payload), {
      status: 200,
      headers: {
        "cache-control": FX_CACHE,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
