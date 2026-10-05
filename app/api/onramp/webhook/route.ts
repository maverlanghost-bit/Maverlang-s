import { onrampWebhookResponseSchema } from "@/lib/api/contracts";
import { callService, handle, readOutput } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/** La firma la verifica el adaptador live. El mock acredita la sesión. */
export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    const extra = (await callService(req, () => services.onramp.handleWebhook(req))) ?? {};
    return readOutput(onrampWebhookResponseSchema, { ok: true, ...extra });
  });
}
