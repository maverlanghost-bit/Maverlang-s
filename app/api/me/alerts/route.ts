import {
  priceAlertCreateSchema,
  priceAlertDeleteSchema,
  priceAlertsResponseSchema,
  priceAlertWriteResponseSchema,
} from "@/lib/api/contracts";
import { assertSameOrigin, callService, handle, parseJson, readOutput, requireSession, requireVisibleSymbol } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";
import { createUserAlert, deleteUserAlert, listUserAlerts } from "@/lib/services/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => listUserAlerts(session.userId));
    return readOutput(priceAlertsResponseSchema, data);
  });
}

export function POST(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    const services = getServices();
    const session = await requireSession(services, req);
    const body = await parseJson(req, priceAlertCreateSchema);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const symbol = await requireVisibleSymbol(body.symbol);
    const data = await callService(req, () =>
      createUserAlert(session.userId, { symbol, direction: body.direction, priceUsd: body.priceUsd }),
    );
    return readOutput(priceAlertWriteResponseSchema, data);
  });
}

export function DELETE(req: Request) {
  return handle("private", async () => {
    assertSameOrigin(req);
    const services = getServices();
    const session = await requireSession(services, req);
    const body = await parseJson(req, priceAlertDeleteSchema);
    const userLimited = await withRateLimit(req, "me", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => deleteUserAlert(session.userId, body.id));
    return readOutput(priceAlertWriteResponseSchema, data);
  });
}
