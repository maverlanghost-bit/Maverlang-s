/**
 * Modelos de dominio (ARQUITECTURA §4).
 * `*Pct` en cotizaciones y cartera es un ratio (0,012 = 1,2 %), igual que `formatPercent`.
 * `*Bps` son puntos base (150 = 1,5 %).
 */

export type Symbol = string;
export type Currency = "CLP" | "USD";
export type Range = "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface Ticker {
  symbol: Symbol;
  underlying: string;
  name: string;
  mint: string;
  decimals: 8;
  /** Emisor visible en la ficha (M52b): Backed/xStocks u Ondo. */
  issuer: "Backed (xStocks)" | "Ondo";
  category: "tech" | "etf" | "fintech" | "consumer" | "finance" | "health" | "energy" | "industrial" | "commodity" | "other";
  logo: string;
  enabled: boolean;
}

/** Precio por acción, ya ajustado por el multiplicador. */
export interface Quote {
  symbol: Symbol;
  priceUsd: number;
  change24hPct: number;
  multiplier: number;
  updatedAt: string;
  /** `jupiter` es el precio de la fuente. `mock` es la ancla, también cuando el live no llegó. */
  source: "jupiter" | "mock";
  /** true sólo cuando el modo live no obtuvo este ticker y se mostró la ancla. */
  reference?: boolean;
  /** true cuando el precio es el último guardado tras un 429 o un error (M38). */
  stale?: boolean;
  /**
   * Precio del subyacente (N15, sólo live): lo que vale la acción en el
   * mercado, fuera del pozo de Solana. El titular (`priceUsd`) es el precio
   * ejecutable del pozo; si se despega, la ficha avisa.
   */
  marketPriceUsd?: number;
  /** Liquidez del pozo en USD (N15, sólo live). */
  liquidityUsd?: number;
}

/** `t` en unix ms. `p` es USD por acción. */
export interface PricePoint {
  t: number;
  p: number;
}

export interface FxRate {
  pair: "USDCLP";
  rate: number;
  source: string;
  updatedAt: string;
}

/** `regular`: lun–vie 09:30–16:00 NY. `offHours`: lun–vie fuera de ese rango. `closed`: sábado y domingo. */
export type MarketSession = "regular" | "offHours" | "closed";

export interface MarketStatus {
  underlyingOpen: boolean;
  session: MarketSession;
  nextChange: string;
  note?: string;
}

export interface Balance {
  mint: string;
  symbol: Symbol | "USDC" | "SOL";
  /** bigint como string. */
  rawAmount: string;
  /** Acciones mostradas = raw × multiplicador / 10^decimals. */
  uiAmount: number;
  valueUsd: number;
}

export interface Position {
  symbol: Symbol;
  shares: number;
  multiplier: number;
  /** null si no hay historial suficiente. */
  avgCostUsd: number | null;
  priceUsd: number;
  valueUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  allocationPct: number;
}

export interface Portfolio {
  address: string;
  totalUsd: number;
  cashUsdc: number;
  positions: Position[];
  pnlUsd: number | null;
  pnlPct: number | null;
  updatedAt: string;
}

export type Side = "buy" | "sell";

export interface FeeConfig {
  bps: number;
  wallet: string | null;
  mode: "usdc_transfer";
}

export interface CostBreakdown {
  platformFeeUsd: number;
  platformFeeBps: number;
  networkFeeSol: number;
  /** ~0,0016 SOL sólo si no existe la cuenta de token. */
  tokenAccountRentSol: number;
  priceImpactPct: number;
  slippageBps: number;
}

export interface TradeQuoteRequest {
  side: Side;
  symbol: Symbol;
  amount: number;
  amountCurrency: "USDC" | "SHARES" | "CLP";
  userPublicKey?: string;
}

export interface TradeQuote {
  id: string;
  side: Side;
  symbol: Symbol;
  /** USDC o acciones, según el lado. En compra, USDC de entrada y acciones de salida. */
  inAmountUi: number;
  outAmountUi: number;
  pricePerShareUsd: number;
  costs: CostBreakdown;
  /** Contra el precio de referencia. Bloquear si supera PRICE_DEVIATION_MAX_BPS. */
  priceDeviationBps: number;
  expiresAt: string;
  route: "jupiter" | "mock";
}

export interface TradeBuildRequest {
  quoteId: string;
  userPublicKey: string;
}

export interface TradeBuildResponse {
  requestId: string;
  transactionBase64: string;
  expiresAt: string;
}

export interface TradeSubmitRequest {
  requestId: string;
  signedTransactionBase64: string;
}

export type OrderStatus = "pending" | "submitted" | "confirmed" | "failed" | "expired";

export interface TradeSubmitResponse {
  orderId: string;
  signature: string | null;
  status: OrderStatus;
}

export interface Order {
  id: string;
  userId: string;
  side: Side;
  symbol: Symbol;
  inAmountUi: number;
  outAmountUi: number;
  feeBps: number;
  status: OrderStatus;
  signature: string | null;
  error?: string;
  createdAt: string;
}

export type ActivityKind = "buy" | "sell" | "deposit" | "withdraw" | "send" | "receive" | "onramp";

export interface Activity {
  id: string;
  kind: ActivityKind;
  symbol: string;
  amountUi: number;
  valueUsd: number | null;
  status: OrderStatus;
  signature: string | null;
  at: string;
}

export interface SendBuildRequest {
  to: string;
  mint: string;
  amountUi: number;
  userPublicKey: string;
}

export type OnrampProviderId = "koywe" | "onramper";

export interface OnrampSessionRequest {
  amountClp: number;
  provider?: OnrampProviderId;
  walletAddress: string;
}

export interface OnrampSession {
  id: string;
  provider: OnrampProviderId;
  mode: "widget_url" | "sdk";
  widgetUrl?: string;
  sdkConfig?: Record<string, unknown>;
  estimatedUsdc: number;
  feeClp: number;
  expiresAt: string;
}

export interface UserProfile {
  /** Privy DID, o el uuid de Supabase Auth. */
  id: string;
  email: string | null;
  displayName: string | null;
  country: string | null;
  isUsPerson: boolean | null;
  walletAddress: string | null;
  onboardingCompleted: boolean;
  language: "es-CL" | "en";
  displayCurrency: Currency;
  createdAt: string;
  /** RUT con formato, sólo si el país es CL. */
  rut: string | null;
  /** `YYYY-MM-DD`. */
  birthDate: string | null;
  phone: string | null;
}

export type LegalDoc = "terminos" | "privacidad" | "riesgos";

export interface Consent {
  userId: string;
  doc: LegalDoc;
  version: string;
  acceptedAt: string;
}

export interface Preferences {
  notifyOrders: boolean;
  notifyDeposits: boolean;
  notifyNews: boolean;
  language: "es-CL" | "en";
  displayCurrency: Currency;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string }; requestId?: string };

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN_REGION"
  | "FORBIDDEN_ORIGIN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "QUOTE_EXPIRED"
  | "PRICE_DEVIATION"
  | "INSUFFICIENT_FUNDS"
  | "MINT_NOT_ALLOWED"
  // M55: compra de un activo en revisión (sólo compra; la venta sigue M54c).
  | "ASSET_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "REAL_DISABLED"
  | "UPSTREAM"
  | "INTERNAL";
