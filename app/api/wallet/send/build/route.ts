import { sendBuildRequestSchema, tradeBuildResponseSchema } from "@/lib/api/contracts";
import { bodyOf, callService, handle, readOutput, requireMint, requireSupabaseUser } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    await requireSupabaseUser(services, req);
    const body = await bodyOf(sendBuildRequestSchema, req);
    const mint = requireMint(body.mint);
    const data = await callService(req, () => services.portfolio.sendBuild({ ...body, mint }));
    return readOutput(tradeBuildResponseSchema, data);
  });
}
