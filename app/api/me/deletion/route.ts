import { deletionRequestSchema, deletionStatusSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
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
    const data = await callService(req, () => services.users.deletionStatus(session.userId));
    return readOutput(deletionStatusSchema, data);
  });
}

export function POST(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const [, session] = await Promise.all([
      bodyOf(deletionRequestSchema, req),
      requireSession(services, req),
    ]);
    const data = await callService(req, () => services.users.requestDeletion(session.userId));
    return readOutput(deletionStatusSchema, data);
  });
}
