import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  SOL_MINT,
  balanceForMint,
  buildDemoActivity,
  buildDemoBalances,
  buildDemoPortfolio,
  demoHeldSymbols,
  nextDemoId,
  saveSend,
} from "@/lib/mocks/demo-state";
import { demoSpotBook } from "@/lib/services/demo-prices";
import { simulateMock } from "@/lib/mocks/latency";
import { isSolanaAddress } from "@/lib/solana/address";
import { isOfficialMint } from "@/lib/solana/allowlist";
import { sendNetworkCost, solCoversFee } from "@/lib/wallet/send-cost";
import type { Activity, Balance, Portfolio, SendBuildRequest, TradeBuildResponse } from "@/lib/types";

function encodeMockTx(label: string): string {
  const bytes = new TextEncoder().encode(label);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const mockPortfolio = {
  async get(address: string): Promise<Portfolio> {
    return simulateMock(`portfolio:${address}`, async () => {
      const spots = await demoSpotBook(demoHeldSymbols());
      return buildDemoPortfolio(address, spots);
    });
  },

  async balances(address: string): Promise<Balance[]> {
    return simulateMock(`balances:${address}`, async () => {
      const spots = await demoSpotBook(demoHeldSymbols());
      return buildDemoBalances(address, spots);
    });
  },

  async activity(address: string): Promise<Activity[]> {
    return simulateMock(`activity:${address}`, () => buildDemoActivity(address));
  },

  /**
   * Arma el envío. No mueve saldo: el débito y la actividad quedan en
   * `settleSend`, cuando la firma pasa por `POST /api/trade/submit`.
   */
  async sendBuild(request: SendBuildRequest): Promise<TradeBuildResponse> {
    return simulateMock(`send:${request.mint}:${request.amountUi}:${request.to}`, () => {
      if (!isOfficialMint(request.mint)) throw new DomainError("MINT_NOT_ALLOWED");
      if (!isSolanaAddress(request.to)) {
        throw new DomainError("VALIDATION", "La dirección de destino no es válida.");
      }
      if (!isSolanaAddress(request.userPublicKey)) {
        throw new DomainError("VALIDATION", "Falta la billetera de origen.");
      }
      if (!(request.amountUi > 0) || !Number.isFinite(request.amountUi)) {
        throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
      }
      const balance = balanceForMint(request.userPublicKey, request.mint);
      if (!balance || balance.uiAmount + 1e-9 < request.amountUi) {
        throw new DomainError("INSUFFICIENT_FUNDS");
      }
      const cost = sendNetworkCost(request.to, request.userPublicKey);
      const sol = balanceForMint(request.userPublicKey, SOL_MINT);
      if (!sol || !solCoversFee(sol.uiAmount, cost)) throw new DomainError("INSUFFICIENT_FUNDS");
      const requestId = nextDemoId("send");
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      saveSend({
        requestId,
        to: request.to.trim(),
        mint: request.mint,
        amountUi: request.amountUi,
        userPublicKey: request.userPublicKey.trim(),
        expiresAt,
        orderId: null,
      });
      return {
        requestId,
        transactionBase64: encodeMockTx(`mock-send:${requestId}`),
        expiresAt,
      };
    });
  },
};
