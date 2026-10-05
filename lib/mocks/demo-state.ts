import "server-only";

import { USDC_MINT } from "@/config/tickers";
import { DEMO_USER_ID, DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";
import { serverEnv } from "@/lib/env";
import { DomainError } from "@/lib/api/result";
import { mockFx } from "@/lib/mocks/fx";
import { roundDigits } from "@/lib/mocks/number";
import { quoteFor } from "@/lib/mocks/prices";
import { addressesEqual } from "@/lib/solana/address";
import { tickerByMint, tickerBySymbol, tradableTicker } from "@/lib/solana/allowlist";
import type {
  Activity,
  Balance,
  Consent,
  LegalDoc,
  OnrampProviderId,
  Order,
  Portfolio,
  Position,
  Preferences,
  TradeQuote,
  TradeSubmitResponse,
  UserProfile,
} from "@/lib/types";

/**
 * Billetera demo. La dirección sale de 32 bytes fijos ("maverlang-demo-wallet-v1"),
 * no es una cuenta con fondos reales.
 * SOL a 150 USD es relleno para mostrar la fila de red: no es una cotización.
 */
export { DEMO_USER_ID, DEMO_WALLET_ADDRESS };

export const SOL_MINT = "So11111111111111111111111111111111111111112";
const MOCK_SOL_PRICE_USD = 150;
const MOCK_SOL_UI = 0.05;

type Lot = { shares: number; avgCostUsd: number };

export type StoredQuote = {
  quote: TradeQuote;
  /** Acciones que entran (compra) o salen (venta). Siempre positivo. */
  shares: number;
  /** USDC que sale (compra) o entra (venta). Siempre positivo. Incluye la comisión si la hay. */
  usdc: number;
};

export type StoredBuild = {
  requestId: string;
  quoteId: string;
  expiresAt: string;
  userPublicKey: string;
  orderId: string | null;
};

/** Envío armado y todavía no firmado. El débito ocurre en `settleSend`. */
export type StoredSend = {
  requestId: string;
  to: string;
  mint: string;
  amountUi: number;
  userPublicKey: string;
  expiresAt: string;
  orderId: string | null;
};

/** Sesión de on-ramp. El USDC entra en `settleOnramp`. */
export type StoredOnramp = {
  id: string;
  userId: string;
  walletAddress: string;
  amountClp: number;
  estimatedUsdc: number;
  feeClp: number;
  provider: OnrampProviderId;
  expiresAt: string;
  settled: boolean;
};

type DemoState = {
  seq: number;
  cashUsdc: number;
  solUi: number;
  positions: Map<string, Lot>;
  activities: Activity[];
  profile: UserProfile;
  prefs: Preferences;
  consents: Consent[];
  quotes: Map<string, StoredQuote>;
  builds: Map<string, StoredBuild>;
  sends: Map<string, StoredSend>;
  onramps: Map<string, StoredOnramp>;
  orders: Map<string, Order>;
};

function consent(doc: LegalDoc, version: string): Consent {
  return {
    userId: DEMO_USER_ID,
    doc,
    version,
    acceptedAt: "2026-09-20T15:00:00.000Z",
  };
}

function createState(): DemoState {
  const positions = new Map<string, Lot>([
    ["AAPLx", { shares: 1, avgCostUsd: 220 }],
    ["NVDAx", { shares: 0.5, avgCostUsd: 140 }],
    ["TSLAx", { shares: 0.8, avgCostUsd: 250 }],
  ]);

  const activities: Activity[] = [
    {
      id: "act-tsla",
      kind: "buy",
      symbol: "TSLAx",
      amountUi: 0.8,
      valueUsd: 200,
      status: "confirmed",
      signature: "mock-sig-tsla",
      at: "2026-09-23T15:00:00.000Z",
    },
    {
      id: "act-nvda",
      kind: "buy",
      symbol: "NVDAx",
      amountUi: 0.5,
      valueUsd: 70,
      status: "confirmed",
      signature: "mock-sig-nvda",
      at: "2026-09-22T15:00:00.000Z",
    },
    {
      id: "act-aapl",
      kind: "buy",
      symbol: "AAPLx",
      amountUi: 1,
      valueUsd: 220,
      status: "confirmed",
      signature: "mock-sig-aapl",
      at: "2026-09-21T15:00:00.000Z",
    },
    {
      id: "act-onramp",
      kind: "onramp",
      symbol: "USDC",
      amountUi: 740,
      valueUsd: 740,
      status: "confirmed",
      signature: null,
      at: "2026-09-20T15:10:00.000Z",
    },
  ];

  return {
    seq: 0,
    cashUsdc: 250,
    solUi: MOCK_SOL_UI,
    positions,
    activities,
    profile: {
      id: DEMO_USER_ID,
      email: "demo@example.com",
      displayName: "Cuenta demo",
      country: "CL",
      isUsPerson: false,
      walletAddress: DEMO_WALLET_ADDRESS,
      onboardingCompleted: true,
      language: "es-CL",
      displayCurrency: "CLP",
      createdAt: "2026-09-20T15:00:00.000Z",
    },
    prefs: {
      notifyOrders: true,
      notifyDeposits: true,
      notifyNews: false,
      language: "es-CL",
      displayCurrency: "CLP",
    },
    consents: [
      consent("terminos", serverEnv.TERMS_VERSION),
      consent("privacidad", serverEnv.PRIVACY_VERSION),
      consent("riesgos", serverEnv.RISKS_VERSION),
    ],
    quotes: new Map(),
    builds: new Map(),
    sends: new Map(),
    onramps: new Map(),
    orders: new Map(),
  };
}

let state = createState();

export function resetDemoState(): void {
  state = createState();
}

export function nextDemoId(prefix: string): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

export function demoCash(): number {
  return state.cashUsdc;
}

export function demoShares(symbol: string): number {
  return state.positions.get(symbol)?.shares ?? 0;
}

export function getDemoProfile(): UserProfile {
  return { ...state.profile };
}

export function updateDemoProfile(id: string, patch: Partial<UserProfile>): UserProfile {
  if (id !== state.profile.id) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  const locked = new Set<keyof UserProfile>(["id", "createdAt"]);
  for (const key of Object.keys(patch) as (keyof UserProfile)[]) {
    if (locked.has(key)) continue;
    const value = patch[key];
    if (value !== undefined) {
      state.profile = { ...state.profile, [key]: value };
    }
  }
  return getDemoProfile();
}

export function getDemoPrefs(id: string): Preferences {
  if (id !== state.profile.id) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  return { ...state.prefs };
}

export function setDemoPrefs(id: string, prefs: Preferences): Preferences {
  if (id !== state.profile.id) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  state.prefs = { ...prefs };
  state.profile = {
    ...state.profile,
    language: prefs.language,
    displayCurrency: prefs.displayCurrency,
  };
  return getDemoPrefs(id);
}

export function addDemoConsent(consentRow: Consent): Consent {
  if (consentRow.userId !== state.profile.id) {
    throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  }
  if (consentRow.version.trim() === "") {
    throw new DomainError("VALIDATION", "Falta la versión del documento.");
  }
  const next = { ...consentRow, acceptedAt: consentRow.acceptedAt || new Date().toISOString() };
  state.consents = [
    next,
    ...state.consents.filter((row) => !(row.doc === next.doc && row.version === next.version)),
  ];
  return { ...next };
}

export function demoConsents(userId: string): Consent[] {
  if (userId !== state.profile.id) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  return state.consents.map((row) => ({ ...row }));
}

function positionFrom(symbol: string, lot: Lot, totalUsd: number): Position {
  const quote = quoteFor(symbol);
  const valueUsd = roundDigits(lot.shares * quote.priceUsd, 2);
  const pnlUsd = roundDigits(valueUsd - lot.shares * lot.avgCostUsd, 2);
  const pnlPct = lot.avgCostUsd === 0 ? null : (quote.priceUsd - lot.avgCostUsd) / lot.avgCostUsd;
  return {
    symbol,
    shares: lot.shares,
    multiplier: quote.multiplier,
    avgCostUsd: lot.avgCostUsd,
    priceUsd: quote.priceUsd,
    valueUsd,
    pnlUsd,
    pnlPct,
    allocationPct: totalUsd > 0 ? valueUsd / totalUsd : 0,
  };
}

function totals(): { totalUsd: number; pnlUsd: number; costUsd: number } {
  let invested = 0;
  let pnlUsd = 0;
  let costUsd = 0;
  for (const [symbol, lot] of state.positions) {
    const quote = quoteFor(symbol);
    const valueUsd = roundDigits(lot.shares * quote.priceUsd, 2);
    invested += valueUsd;
    costUsd += lot.shares * lot.avgCostUsd;
    pnlUsd += valueUsd - lot.shares * lot.avgCostUsd;
  }
  return {
    totalUsd: roundDigits(invested + state.cashUsdc, 2),
    pnlUsd: roundDigits(pnlUsd, 2),
    costUsd,
  };
}

export function buildDemoPortfolio(address: string): Portfolio {
  const updatedAt = new Date().toISOString();
  if (address !== DEMO_WALLET_ADDRESS) {
    return {
      address,
      totalUsd: 0,
      cashUsdc: 0,
      positions: [],
      pnlUsd: null,
      pnlPct: null,
      updatedAt,
    };
  }
  const summary = totals();
  const positions = [...state.positions.entries()].map(([symbol, lot]) =>
    positionFrom(symbol, lot, summary.totalUsd),
  );
  return {
    address,
    totalUsd: summary.totalUsd,
    cashUsdc: roundDigits(state.cashUsdc, 6),
    positions,
    pnlUsd: summary.pnlUsd,
    pnlPct: summary.costUsd > 0 ? summary.pnlUsd / summary.costUsd : null,
    updatedAt,
  };
}

function sharesToRaw(shares: number, multiplier: number, decimals: number): bigint {
  const tokens = shares / multiplier;
  return BigInt(Math.round(tokens * 10 ** decimals));
}

function rawToUi(raw: bigint, multiplier: number, decimals: number): number {
  return (Number(raw) * multiplier) / 10 ** decimals;
}

export function buildDemoBalances(address: string): Balance[] {
  if (address !== DEMO_WALLET_ADDRESS) return [];
  const balances: Balance[] = [];
  const usdcRaw = sharesToRaw(state.cashUsdc, 1, 6);
  balances.push({
    mint: USDC_MINT,
    symbol: "USDC",
    rawAmount: usdcRaw.toString(),
    uiAmount: rawToUi(usdcRaw, 1, 6),
    valueUsd: roundDigits(state.cashUsdc, 2),
  });
  const solRaw = sharesToRaw(state.solUi, 1, 9);
  balances.push({
    mint: SOL_MINT,
    symbol: "SOL",
    rawAmount: solRaw.toString(),
    uiAmount: rawToUi(solRaw, 1, 9),
    valueUsd: roundDigits(state.solUi * MOCK_SOL_PRICE_USD, 2),
  });
  for (const [symbol, lot] of state.positions) {
    const ticker = tickerBySymbol(symbol);
    if (!ticker) continue;
    const quote = quoteFor(symbol);
    const raw = sharesToRaw(lot.shares, quote.multiplier, ticker.decimals);
    const uiAmount = rawToUi(raw, quote.multiplier, ticker.decimals);
    balances.push({
      mint: ticker.mint,
      symbol: ticker.symbol,
      rawAmount: raw.toString(),
      uiAmount,
      valueUsd: roundDigits(uiAmount * quote.priceUsd, 2),
    });
  }
  return balances;
}

export function buildDemoActivity(address: string): Activity[] {
  if (address !== DEMO_WALLET_ADDRESS) return [];
  return state.activities.map((row) => ({ ...row }));
}

export function balanceForMint(address: string, mint: string): Balance | undefined {
  return buildDemoBalances(address).find((row) => row.mint === mint);
}

export function applyBuy(symbol: string, shares: number, priceUsd: number, usdc: number): void {
  if (!tradableTicker(symbol)) throw new DomainError("MINT_NOT_ALLOWED");
  if (state.cashUsdc + 1e-9 < usdc) throw new DomainError("INSUFFICIENT_FUNDS");
  const current = state.positions.get(symbol);
  const nextShares = roundDigits((current?.shares ?? 0) + shares, 8);
  const prevCost = (current?.shares ?? 0) * (current?.avgCostUsd ?? priceUsd);
  const avgCostUsd = nextShares === 0 ? priceUsd : (prevCost + shares * priceUsd) / nextShares;
  state.positions.set(symbol, { shares: nextShares, avgCostUsd });
  state.cashUsdc = roundDigits(state.cashUsdc - usdc, 6);
}

export function applySell(symbol: string, shares: number, usdc: number): void {
  const current = state.positions.get(symbol);
  if (!current || current.shares + 1e-9 < shares) throw new DomainError("INSUFFICIENT_FUNDS");
  const nextShares = roundDigits(current.shares - shares, 8);
  if (nextShares <= 1e-8) state.positions.delete(symbol);
  else state.positions.set(symbol, { shares: nextShares, avgCostUsd: current.avgCostUsd });
  state.cashUsdc = roundDigits(state.cashUsdc + usdc, 6);
}

export function pushActivity(activity: Activity): void {
  state.activities = [activity, ...state.activities];
}

export function saveQuote(stored: StoredQuote): void {
  state.quotes.set(stored.quote.id, stored);
}

export function recallQuote(id: string): StoredQuote | undefined {
  return state.quotes.get(id);
}

export function saveBuild(build: StoredBuild): void {
  state.builds.set(build.requestId, build);
}

export function recallBuild(requestId: string): StoredBuild | undefined {
  return state.builds.get(requestId);
}

export function markBuildUsed(requestId: string, orderId: string): void {
  const build = state.builds.get(requestId);
  if (!build) return;
  state.builds.set(requestId, { ...build, orderId });
}

export function saveOrder(order: Order): void {
  state.orders.set(order.id, order);
}

export function recallOrder(id: string): Order | undefined {
  const order = state.orders.get(id);
  return order ? { ...order } : undefined;
}

export function fxRate(): number {
  return mockFx().rate;
}

export function saveSend(send: StoredSend): void {
  state.sends.set(send.requestId, send);
}

export function saveOnramp(session: StoredOnramp): void {
  state.onramps.set(session.id, session);
}

/**
 * Acredita el USDC de una sesión y deja un depósito en la actividad.
 * La segunda llamada no suma de nuevo.
 */
export function settleOnramp(sessionId: string): { estimatedUsdc: number; already: boolean } {
  const row = state.onramps.get(sessionId);
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos ese depósito.");
  if (row.settled) return { estimatedUsdc: row.estimatedUsdc, already: true };
  if (Date.now() > Date.parse(row.expiresAt)) {
    throw new DomainError("QUOTE_EXPIRED", "La sesión de depósito venció.");
  }
  if (!addressesEqual(row.walletAddress, DEMO_WALLET_ADDRESS)) {
    throw new DomainError("VALIDATION", "Esa billetera no es la de la demo.");
  }

  const at = new Date().toISOString();
  state.onramps.set(sessionId, { ...row, settled: true });
  state.cashUsdc = roundDigits(state.cashUsdc + row.estimatedUsdc, 6);
  pushActivity({
    id: nextDemoId("act"),
    kind: "deposit",
    symbol: "USDC",
    amountUi: row.estimatedUsdc,
    valueUsd: row.estimatedUsdc,
    status: "confirmed",
    signature: null,
    at,
  });
  return { estimatedUsdc: row.estimatedUsdc, already: false };
}

function symbolForMint(mint: string): string {
  if (mint === USDC_MINT) return "USDC";
  if (mint === SOL_MINT) return "SOL";
  const ticker = tickerByMint(mint);
  if (!ticker?.enabled) throw new DomainError("MINT_NOT_ALLOWED");
  return ticker.symbol;
}

/**
 * Resta USDC o acciones. El SOL de la red no se descuenta en la demo.
 * Si el destino es la propia billetera, el saldo no cambia: el token no sale.
 */
export function applySend(mint: string, amountUi: number, debit = true): { symbol: string; valueUsd: number } {
  const symbol = symbolForMint(mint);
  if (mint === USDC_MINT) {
    if (state.cashUsdc + 1e-9 < amountUi) throw new DomainError("INSUFFICIENT_FUNDS");
    if (debit) state.cashUsdc = roundDigits(state.cashUsdc - amountUi, 6);
    return { symbol, valueUsd: roundDigits(amountUi, 2) };
  }
  if (mint === SOL_MINT) throw new DomainError("MINT_NOT_ALLOWED");
  const lot = state.positions.get(symbol);
  if (!lot || lot.shares + 1e-9 < amountUi) throw new DomainError("INSUFFICIENT_FUNDS");
  if (debit) {
    const nextShares = roundDigits(lot.shares - amountUi, 8);
    if (nextShares <= 1e-8) state.positions.delete(symbol);
    else state.positions.set(symbol, { shares: nextShares, avgCostUsd: lot.avgCostUsd });
  }
  return { symbol, valueUsd: roundDigits(amountUi * quoteFor(symbol).priceUsd, 2) };
}

/**
 * Cierra un envío firmado. `null` si ese id no es un envío.
 * §2.4 no tiene submit propio: lo llama `POST /api/trade/submit`.
 * La orden sólo sirve para el polling. Lo que se ve es la actividad `send`.
 */
export function settleSend(
  requestId: string,
  signedTransactionBase64: string,
  userId: string,
): TradeSubmitResponse | null {
  const send = state.sends.get(requestId);
  if (!send) return null;
  if (send.orderId) {
    const existing = recallOrder(send.orderId);
    if (!existing) throw new DomainError("NOT_FOUND", "No encontramos ese envío.");
    return { orderId: existing.id, signature: existing.signature, status: existing.status };
  }
  if (signedTransactionBase64.trim() === "") {
    throw new DomainError("VALIDATION", "Falta la transacción firmada.");
  }
  if (Date.now() > Date.parse(send.expiresAt)) throw new DomainError("QUOTE_EXPIRED");

  const orderId = nextDemoId("order");
  const createdAt = new Date().toISOString();
  const symbol = symbolForMint(send.mint);
  const base = {
    id: orderId,
    userId,
    side: "sell" as const,
    symbol,
    inAmountUi: send.amountUi,
    outAmountUi: send.amountUi,
    feeBps: 0,
    createdAt,
  };

  try {
    const moved = applySend(send.mint, send.amountUi, !addressesEqual(send.to, send.userPublicKey));
    const signature = `mock-sig-${orderId}`;
    saveOrder({ ...base, symbol: moved.symbol, status: "confirmed", signature });
    state.sends.set(requestId, { ...send, orderId });
    pushActivity({
      id: nextDemoId("act"),
      kind: "send",
      symbol: moved.symbol,
      amountUi: send.amountUi,
      valueUsd: moved.valueUsd,
      status: "confirmed",
      signature,
      at: createdAt,
    });
    return { orderId, signature, status: "confirmed" };
  } catch (error) {
    const message = error instanceof DomainError ? error.message : "No se pudo enviar.";
    saveOrder({ ...base, status: "failed", signature: null, error: message });
    state.sends.set(requestId, { ...send, orderId });
    return { orderId, signature: null, status: "failed" };
  }
}
