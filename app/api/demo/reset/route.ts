import { z } from "zod";

import { handle, requireSession, isRealAccountRequest, isUserDemoRequest } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { resetDemoState } from "@/lib/mocks/demo-state";
import { getServices } from "@/lib/services";
import { demoSupabase } from "@/lib/services/demo.supabase";

export const runtime = "nodejs";

const resetResponseSchema = z.object({
  cashUsd: z.number().nonnegative(),
  resetCount: z.number().int().nonnegative().optional(),
});

/**
 * Reinicia la cuenta demo: el saldo vuelve a US$1.000 y se borran
 * las posiciones y las órdenes de ese usuario. Requiere sesión.
 * En mock (tests/e2e) reinicia la demo en memoria.
 */
export function POST(req: Request) {
  return handle("no-store", async () => {
    const services = getServices();
    const session = await requireSession(services, req);
    if (isRealAccountRequest(req)) {
      throw new DomainError("VALIDATION", "La cuenta real todavía no opera.");
    }
    if (isUserDemoRequest(req)) {
      const result = await demoSupabase.reset(session.userId);
      return resetResponseSchema.parse(result);
    }
    resetDemoState();
    return resetResponseSchema.parse({ cashUsd: 1000 });
  });
}
