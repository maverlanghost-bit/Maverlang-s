import "server-only";

import { defaultSlippageBps, feeConfig, priceDeviationMaxBps } from "@/config/fees";
import { DomainError } from "@/lib/api/result";
import {
  applyBuy,
  applySell,
  demoCash,
  demoShares,
  fxRate,
  markBuildUsed,
  nextDemoId,
  pushActivity,
  recallBuild,
  recallOrder,
  recallQuote,
  saveBuild,
  saveOrder,
  saveQuote,
} from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";
import { roundDigits } from "@/lib/mocks/number";
import { hashSeed } from "@/lib/mocks/prng";
import { quoteFor } from "@/lib/mocks/prices";
import { tickerBySymbol, tradableTicker } from "@/lib/solana/allowlist";
import type {
  Order,
  TradeBuildRequest,
  TradeBuildResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeSubmitRequest,
  TradeSubmitResponse,
} from "@/lib/types";

const QUOTE_TTL_MS = 60_000;
/** Tarifa base de Solana: 5000 lamports. No es una comisión de la plataforma. */
const NETWORK_FEE_SOL = 0.000005;
/** Rent de una cuenta de token nueva, según ARQUITECTURA §6. */
const TOKEN_ACCOUNT_RENT_SOL = 0.0016;

function requireTradable(symbol: string) {
  const ticker = tradableTicker(symbol);
  if (ticker) return ticker;
  const known = tickerBySymbol(symbol);
  if (known && !known.enabled) throw new DomainError("MINT_NOT_ALLOWED");
  throw new DomainError("NOT_FOUND", "No encontramos esa acción.");
}

function deviationFor(symbol: string): number {
  return hashSeed(`dev:${symbol}`) % 40;
}

function encodeMockTx(label: string): string {
  const bytes = new TextEncoder().encode(label);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function quoteCore(request: TradeQuoteRequest): TradeQuote {
  if (!(request.amount > 0) || !Number.isFinite(request.amount)) {
    throw new DomainError("VALIDATION", "El monto tiene que ser mayor que cero.");
  }
  const ticker = requireTradable(request.symbol);
  if (feeConfig.bps > 0 && !feeConfig.wallet) {
    throw new DomainError("INTERNAL", "Falta la billetera de comisión.");
  }

  const spot = quoteFor(ticker.symbol);
  const price = spot.priceUsd;
  let notionalUsd: number;
  if (request.amountCurrency === "SHARES") notionalUsd = request.amount * price;
  else if (request.amountCurrency === "CLP") notionalUsd = request.amount / fxRate();
  else notionalUsd = request.amount;

  const feeUsd = roundDigits((notionalUsd * feeConfig.bps) / 10_000, 6);
  let shares: number;
  let usdc: number;
  if (request.side === "buy") {
    if (request.amountCurrency === "SHARES") {
      shares = request.amount;
      usdc = notionalUsd + feeUsd;
    } else {
      usdc = notionalUsd;
      const net = notionalUsd - feeUsd;
      if (net <= 0) throw new DomainError("VALIDATION", "La comisión se come el monto.");
      shares = net / price;
    }
    if (demoCash() + 1e-9 < usdc) throw new DomainError("INSUFFICIENT_FUNDS");
  } else if (request.amountCurrency === "SHARES") {
    shares = request.amount;
    usdc = Math.max(0, notionalUsd - feeUsd);
  } else {
    usdc = notionalUsd;
    shares = (notionalUsd + feeUsd) / price;
  }

  shares = roundDigits(shares, 8);
  usdc = roundDigits(usdc, 6);
  if (shares <= 0 || usdc < 0) throw new DomainError("VALIDATION", "El monto es demasiado bajo.");
  if (request.side === "sell" && demoShares(ticker.symbol) + 1e-9 < shares) {
    throw new DomainError("INSUFFICIENT_FUNDS");
  }

  const deviation = deviationFor(ticker.symbol);
  if (deviation > priceDeviationMaxBps) throw new DomainError("PRICE_DEVIATION");

  const opensAccount = request.side === "buy" && demoShares(ticker.symbol) <= 0;
  const quote: TradeQuote = {
    id: nextDemoId("quote"),
    side: request.side,
    symbol: ticker.symbol,
    inAmountUi: request.side === "buy" ? usdc : shares,
    outAmountUi: request.side === "buy" ? shares : usdc,
    pricePerShareUsd: price,
    costs: {
      platformFeeUsd: feeUsd,
      platformFeeBps: feeConfig.bps,
      networkFeeSol: NETWORK_FEE_SOL,
      tokenAccountRentSol: opensAccount ? TOKEN_ACCOUNT_RENT_SOL : 0,
      priceImpactPct: (hashSeed(`impact:${ticker.symbol}`) % 20) / 10_000,
      slippageBps: defaultSlippageBps,
    },
    priceDeviationBps: deviation,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    route: "mock",
  };

  saveQuote({ quote, shares, usdc });
  return quote;
}

function expired(iso: string): boolean {
  return Date.now() > Date.parse(iso);
}

export const mockTrade = {
  async quote(request: TradeQuoteRequest): Promise<TradeQuote> {
    return simulateMock(`quote:${request.side}:${request.symbol}:${request.amount}:${request.amountCurrency}`, () =>
      quoteCore(request),
    );
  },

  async build(request: TradeBuildRequest): Promise<TradeBuildResponse> {
    return simulateMock(`build:${request.quoteId}`, () => {
      const stored = recallQuote(request.quoteId);
      if (!stored) throw new DomainError("NOT_FOUND", "No encontramos esa cotización.");
      if (expired(stored.quote.expiresAt)) throw new DomainError("QUOTE_EXPIRED");
      if (request.userPublicKey.trim().length < 32) {
        throw new DomainError("VALIDATION", "Falta la billetera.");
      }
      const response: TradeBuildResponse = {
        requestId: nextDemoId("build"),
        transactionBase64: encodeMockTx(`mock-tx:${request.quoteId}`),
        expiresAt: stored.quote.expiresAt,
      };
      saveBuild({
        requestId: response.requestId,
        quoteId: stored.quote.id,
        expiresAt: response.expiresAt,
        userPublicKey: request.userPublicKey,
        orderId: null,
      });
      return response;
    });
  },

  async submit(request: TradeSubmitRequest, userId: string): Promise<TradeSubmitResponse> {
    return simulateMock(`submit:${request.requestId}`, () => {
      const build = recallBuild(request.requestId);
      if (!build) throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
      if (build.orderId) {
        const existing = recallOrder(build.orderId);
        if (!existing) throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
        return { orderId: existing.id, signature: existing.signature, status: existing.status };
      }
      if (request.signedTransactionBase64.trim() === "") {
        throw new DomainError("VALIDATION", "Falta la transacción firmada.");
      }
      const stored = recallQuote(build.quoteId);
      if (!stored) throw new DomainError("NOT_FOUND", "No encontramos esa cotización.");
      if (expired(build.expiresAt) || expired(stored.quote.expiresAt)) throw new DomainError("QUOTE_EXPIRED");

      const orderId = nextDemoId("order");
      const createdAt = new Date().toISOString();
      const base = {
        id: orderId,
        userId,
        side: stored.quote.side,
        symbol: stored.quote.symbol,
        inAmountUi: stored.quote.inAmountUi,
        outAmountUi: stored.quote.outAmountUi,
        feeBps: stored.quote.costs.platformFeeBps,
        createdAt,
      };

      try {
        if (stored.quote.side === "buy") {
          applyBuy(stored.quote.symbol, stored.shares, stored.quote.pricePerShareUsd, stored.usdc);
        } else {
          applySell(stored.quote.symbol, stored.shares, stored.usdc);
        }
      } catch (error) {
        const message = error instanceof DomainError ? error.message : "No se pudo ejecutar.";
        const failed: Order = {
          ...base,
          status: "failed",
          signature: null,
          error: message,
        };
        saveOrder(failed);
        markBuildUsed(build.requestId, orderId);
        return { orderId, signature: null, status: "failed" };
      }

      const signature = `mock-sig-${orderId}`;
      const confirmed: Order = { ...base, status: "confirmed", signature };
      saveOrder(confirmed);
      markBuildUsed(build.requestId, orderId);
      pushActivity({
        id: nextDemoId("act"),
        kind: stored.quote.side,
        symbol: stored.quote.symbol,
        amountUi: stored.shares,
        valueUsd: stored.usdc,
        status: "confirmed",
        signature,
        at: createdAt,
      });
      return { orderId, signature, status: "confirmed" };
    });
  },

  async status(id: string): Promise<Order> {
    return simulateMock(`status:${id}`, () => {
      const order = recallOrder(id);
      if (!order) throw new DomainError("NOT_FOUND", "No encontramos esa orden.");
      return order;
    });
  },
};
