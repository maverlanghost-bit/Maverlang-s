import { deletionRequestSchema, deletionStatusSchema } from "@/lib/api/contracts";
import { parseJson, assertSameOrigin, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * No está en §2.4. T17 registra la solicitud y no borra la cuenta:
 * los activos siguen en la billetera.
 */
export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.users.deletionStatus(session.userId));
    return readOutput(deletionStatusSchema, data);
  });
}

export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    const services = getServices();
    const session = await requireSession(services, req);
    await parseJson(req, deletionRequestSchema);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.users.requestDeletion(session.userId));
    return readOutput(deletionStatusSchema, data);
  });
}
