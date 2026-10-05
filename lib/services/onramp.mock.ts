import "server-only";

import { serverEnv } from "@/lib/env";
import { DomainError } from "@/lib/api/result";
import { fxRate, nextDemoId } from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";
import { roundDigits } from "@/lib/mocks/number";
import type { OnrampSession, OnrampSessionRequest } from "@/lib/types";

export const mockOnramp = {
  async createSession(request: OnrampSessionRequest, userId: string): Promise<OnrampSession> {
    return simulateMock(`onramp:${userId}:${request.amountClp}`, () => {
      if (!(request.amountClp > 0) || !Number.isFinite(request.amountClp)) {
        throw new DomainError("VALIDATION", "El monto en pesos tiene que ser mayor que cero.");
      }
      if (request.walletAddress.trim().length < 32) {
        throw new DomainError("VALIDATION", "Falta la dirección de destino.");
      }
      const id = nextDemoId("onramp");
      const provider = request.provider ?? serverEnv.ONRAMP_PROVIDER;
      return {
        id,
        provider,
        mode: "widget_url",
        widgetUrl: `/app/billetera/depositar?session=${id}`,
        estimatedUsdc: roundDigits(request.amountClp / fxRate(), 2),
        // El proveedor live informa su propia comisión. En mock no se inventa un cobro.
        feeClp: 0,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
  },

  async handleWebhook(req: Request): Promise<void> {
    await simulateMock("onramp-webhook", async () => {
      await req.text().catch(() => "");
    });
  },
};
