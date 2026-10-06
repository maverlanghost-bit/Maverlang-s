import { tradeBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireSupabaseUser } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    await requireSupabaseUser(services, req);
    const body = await bodyOf(tradeBuildRequestSchema, req);
    const data = await callService(req, () => services.trade.build(body));
    return readOutput(tradeBuildResponseSchema, data);
  });
}
