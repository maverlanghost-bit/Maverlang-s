import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  balanceForMint,
  buildDemoActivity,
  buildDemoBalances,
  buildDemoPortfolio,
  nextDemoId,
} from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";
import { isOfficialMint } from "@/lib/solana/allowlist";
import type { Activity, Balance, Portfolio, SendBuildRequest, TradeBuildResponse } from "@/lib/types";

function encodeMockTx(label: string): string {
  const bytes = new TextEncoder().encode(label);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const mockPortfolio = {
  async get(address: string): Promise<Portfolio> {
    return simulateMock(`portfolio:${address}`, () => buildDemoPortfolio(address));
  },

  async balances(address: string): Promise<Balance[]> {
    return simulateMock(`balances:${address}`, () => buildDemoBalances(address));
  },

  async activity(address: string): Promise<Activity[]> {
    return simulateMock(`activity:${address}`, () => buildDemoActivity(address));
  },

  /**
   * Arma el envío mock. No mueve saldo: §2.4 no tiene submit de envío.
   * El débito queda para cuando exista esa confirmación.
   */
  async sendBuild(request: SendBuildRequest): Promise<TradeBuildResponse> {
    return simulateMock(`send:${request.mint}:${request.amountUi}`, () => {
      if (!isOfficialMint(request.mint)) throw new DomainError("MINT_NOT_ALLOWED");
      if (!(request.amountUi > 0) || !Number.isFinite(request.amountUi)) {
        throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
      }
      if (request.to.trim().length < 32) {
        throw new DomainError("VALIDATION", "La dirección de destino no es válida.");
      }
      if (request.userPublicKey.trim().length < 32) {
        throw new DomainError("VALIDATION", "Falta la billetera de origen.");
      }
      const balance = balanceForMint(request.userPublicKey, request.mint);
      if (!balance || balance.uiAmount + 1e-9 < request.amountUi) {
        throw new DomainError("INSUFFICIENT_FUNDS");
      }
      const requestId = nextDemoId("send");
      return {
        requestId,
        transactionBase64: encodeMockTx(`mock-send:${requestId}`),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    });
  },
};
