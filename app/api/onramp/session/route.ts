import { onrampSessionRequestSchema, onrampSessionSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    const [body, session] = await Promise.all([
      bodyOf(onrampSessionRequestSchema, req),
      requireSession(services, req),
    ]);
    const data = await callService(req, () => services.onramp.createSession(body, session.userId));
    return readOutput(onrampSessionSchema, data);
  });
}
