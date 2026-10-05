import { tradeBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const body = await bodyOf(tradeBuildRequestSchema, req);
    const services = getServices();
    const data = await callService(req, () => services.trade.build(body));
    return readOutput(tradeBuildResponseSchema, data);
  });
}
