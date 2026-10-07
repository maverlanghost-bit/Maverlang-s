import { favoritesRequestSchema, favoritesResponseSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.users.listFavorites(session.userId));
    return readOutput(favoritesResponseSchema, data);
  });
}

export function PUT(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const [body, session] = await Promise.all([
      bodyOf(favoritesRequestSchema, req),
      requireSession(services, req),
    ]);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.users.saveFavorites(session.userId, body.symbols));
    return readOutput(favoritesResponseSchema, data);
  });
}
