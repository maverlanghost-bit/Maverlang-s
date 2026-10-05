import { onrampWebhookResponseSchema } from "@/lib/api/contracts";
import { callService, handle, readOutput } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/** La firma la verifica el adaptador. El mock sólo acepta el cuerpo. */
export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    await callService(req, () => services.onramp.handleWebhook(req));
    return readOutput(onrampWebhookResponseSchema, { ok: true });
  });
}
