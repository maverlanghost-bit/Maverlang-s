import { geoResponseSchema } from "@/lib/api/contracts";
import { handle, readOutput } from "@/lib/api/handler";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTRY = /^[A-Z]{2}$/;

/** Sin header de Vercel (local) se asume CL, el país de la app. */
export function GET(req: Request) {
  return handle("no-store", async () => {
    const raw = req.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
    const country = COUNTRY.test(raw) ? raw : "CL";
    const blocked = serverEnv.GEO_BLOCKED_COUNTRIES.includes(country);
    return readOutput(geoResponseSchema, { country, blocked });
  });
}
