import { profileUpdateSchema, userProfileSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const data = await callService(req, () => services.users.get(session.userId));
    return readOutput(userProfileSchema, data);
  });
}

export function PATCH(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const [body, session] = await Promise.all([
      bodyOf(profileUpdateSchema, req),
      requireSession(services, req),
    ]);
    const data = await callService(req, () => services.users.update(session.userId, body));
    return readOutput(userProfileSchema, data);
  });
}
