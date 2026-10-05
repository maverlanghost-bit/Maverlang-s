import { consentRequestSchema, consentSchema, consentsResponseSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSession } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/** §2.4 sólo lista el POST. El perfil necesita leer lo ya aceptado. */
export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const data = await callService(req, () => services.users.listConsents(session.userId));
    return readOutput(consentsResponseSchema, data);
  });
}

export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    const [body, session] = await Promise.all([
      bodyOf(consentRequestSchema, req),
      requireSession(services, req),
    ]);
    const data = await callService(req, () =>
      services.users.addConsent({
        userId: session.userId,
        doc: body.doc,
        version: body.version,
        acceptedAt: new Date().toISOString(),
      }),
    );
    return readOutput(consentSchema, data);
  });
}
