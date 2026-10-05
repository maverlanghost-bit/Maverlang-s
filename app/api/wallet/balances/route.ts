import { balancesResponseSchema } from "@/lib/api/contracts";
import { callService, handle, readOutput, requireSession, requireWallet } from "@/lib/api/handler";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle("private", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    const address = requireWallet(session);
    const data = await callService(req, () => services.portfolio.balances(address));
    return readOutput(balancesResponseSchema, data);
  });
}
