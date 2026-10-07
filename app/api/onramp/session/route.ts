import { onrampSessionRequestSchema, onrampSessionSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const ipLimited = await withRateLimit(req, "tradeIp");
    if (ipLimited) return ipLimited;
    const services = getServices();
    const [body, session] = await Promise.all([
      bodyOf(onrampSessionRequestSchema, req),
      requireSession(services, req),
    ]);
    const userLimited = await withRateLimit(req, "trade", [session.userId]);
    if (userLimited) return userLimited;
    const data = await callService(req, () => services.onramp.createSession(body, session.userId));
    return readOutput(onrampSessionSchema, data);
  });
}
