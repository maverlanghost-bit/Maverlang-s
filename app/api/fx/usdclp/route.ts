import { fxRateSchema } from "@/lib/api/contracts";
import { callService, handle, readOutput } from "@/lib/api/handler";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("no-store", async () => {
    const limited = await withRateLimit(req, "publicGet");
    if (limited) return limited;
    const services = getServices();
    const data = await callService(req, () => services.prices.fx());
    return readOutput(fxRateSchema, data);
  });
}
