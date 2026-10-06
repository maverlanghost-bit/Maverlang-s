import "server-only";

import { z } from "zod";

import { ONRAMP_MIN_CLP } from "@/config/onramp";
import { serverEnv } from "@/lib/env";
import { formatClp } from "@/lib/format";
import { DomainError } from "@/lib/api/result";
import { nextDemoId, saveOnramp, settleOnramp } from "@/lib/mocks/demo-state";
import { demoFxRate } from "@/lib/services/demo-prices";
import { simulateMock } from "@/lib/mocks/latency";
import { roundDigits } from "@/lib/mocks/number";
import { isSolanaAddress } from "@/lib/solana/address";
import type { OnrampSession, OnrampSessionRequest } from "@/lib/types";

const noticeSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

export const mockOnramp = {
  async createSession(request: OnrampSessionRequest, userId: string): Promise<OnrampSession> {
    return simulateMock(`onramp:${userId}:${request.amountClp}:${request.provider ?? ""}`, async () => {
      if (!Number.isFinite(request.amountClp) || request.amountClp < ONRAMP_MIN_CLP) {
        throw new DomainError("VALIDATION", `El mínimo del proveedor es ${formatClp(ONRAMP_MIN_CLP)}.`);
      }
      if (!isSolanaAddress(request.walletAddress)) {
        throw new DomainError("VALIDATION", "Falta la dirección de destino.");
      }
      const fx = await demoFxRate();
      if (!(fx > 0) || !Number.isFinite(fx)) throw new DomainError("UPSTREAM", "Dólar no disponible");
      const id = nextDemoId("onramp");
      const provider = request.provider ?? serverEnv.ONRAMP_PROVIDER;
      const feeClp = 0;
      const estimatedUsdc = roundDigits((request.amountClp - feeClp) / fx, 2);
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      saveOnramp({
        id,
        userId,
        walletAddress: request.walletAddress.trim(),
        amountClp: request.amountClp,
        estimatedUsdc,
        feeClp,
        provider,
        expiresAt,
        settled: false,
      });
      return {
        id,
        provider,
        mode: "widget_url",
        widgetUrl: `/app/billetera/depositar?session=${id}`,
        estimatedUsdc,
        // El proveedor live informa su propia comisión. En mock no se inventa un cobro.
        feeClp,
        expiresAt,
      };
    });
  },

  async handleWebhook(req: Request): Promise<{ estimatedUsdc: number; already: boolean }> {
    return simulateMock("onramp-webhook", async () => {
      let json: unknown;
      try {
        json = await req.json();
      } catch {
        throw new DomainError("VALIDATION", "El aviso del proveedor no es válido.");
      }
      const parsed = noticeSchema.safeParse(json);
      if (!parsed.success) throw new DomainError("VALIDATION", "El aviso del proveedor no es válido.");
      return settleOnramp(parsed.data.sessionId);
    });
  },
};
