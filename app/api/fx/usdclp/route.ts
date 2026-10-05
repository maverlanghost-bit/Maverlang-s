import { fxRateSchema } from "@/lib/api/contracts";
import { callService, handle, readOutput } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    const data = await callService(req, () => services.prices.fx());
    return readOutput(fxRateSchema, data);
  });
}
