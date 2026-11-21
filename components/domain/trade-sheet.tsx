"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { QuoteExchangeSummary } from "@/components/domain/quote-exchange-summary";
import { Accordion } from "@/components/ui/accordion";
import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { TradeImpactPreview } from "@/components/domain/trade-impact-preview";
import { LimitOrdersPanel } from "@/components/domain/limit-orders-panel";
import { MarketStatusPill } from "@/components/domain/market-status-pill";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { preloadTradeConfirmationWave, TradeConfirmationHeading } from "@/components/domain/trade-confirmation-wave";
import { TradeExecutionStepper } from "@/components/domain/trade-execution-stepper";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { IconBack, IconClock } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";
import { QUOTE_DEBOUNCE_MS } from "@/config/trade";
import type { Messages } from "@/content/i18n/es-CL";
import { ApiError, buildTrade, getTradeStatus, quoteTrade, submitTrade } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { signDemoTransaction, useSignTrade } from "@/lib/auth/sign-transaction";
import { isRealAccountUiBlocked } from "@/lib/account/real-ui-gate";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatShares } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { SPOT_MS, useAssetStatus, useMarketStatus, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { effectiveMinOrderUsd } from "@/lib/market/asset-status.shared";
import { formatUnitPrice } from "@/lib/market/price-format";
import {
  amountBlock,
  convertAmount,
  maxAmount,
  parseAmount,
  quickTradeAmounts,
  type AmountBlock,
  type TradeAmountCurrency,
} from "@/lib/trade/amount";
import { addLimitOrder, type LimitOrder, type LimitOrderExpiry } from "@/lib/trade/limit-orders-store";
import type { Currency, Order, Side, Ticker, TradeQuote } from "@/lib/types";

const DEPOSIT_HREF = "/app/billetera/depositar";
const POLL_MS = 1_000;
const POLL_BUDGET_MS = 20_000;
/** Vigencia nominal de una cotización en la UI; la barra se llena respecto a esto. */
const QUOTE_VALIDITY_MS = 15_000;

const BUY_CURRENCIES = ["USDC", "SHARES"] as const satisfies readonly TradeAmountCurrency[];
const SELL_CURRENCIES = ["SHARES", "USDC"] as const satisfies readonly TradeAmountCurrency[];

const solFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 6 });
const plainPercent = new Intl.NumberFormat("es-CL", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "never",
});

type Phase = "form" | "review" | "signing" | "submitting" | "done" | "error";

type LiveQuote = {
  key: string;
  quote: TradeQuote | null;
  error: string | null;
  pending: boolean;
};

const idleQuote: LiveQuote = { key: "", quote: null, error: null, pending: false };

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

/** «Disponible {amount}» → «Disponible». Reutiliza el texto ya traducido. */
function templateLabel(template: string) {
  return template.split("{amount}")[0]?.trim() ?? template;
}

function countdownLabel(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds} s`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function explorerTxUrl(signature: string) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
  const url = `https://solscan.io/tx/${encodeURIComponent(signature)}`;
  if (!cluster || cluster === "mainnet-beta") return url;
  return `${url}?cluster=${encodeURIComponent(cluster)}`;
}

function failureMessage(t: Messages, error: unknown): string | null {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof ApiError) return t.trade.errors[error.code];
  if (error instanceof Error && error.message === "NO_WALLET") return t.trade.noWallet;
  return t.trade.signFailed;
}

function orderFailure(t: Messages, order: Order) {
  if (order.error && order.error.trim()) return order.error;
  if (order.status === "expired") return t.trade.errors.QUOTE_EXPIRED;
  return t.trade.orderFailed;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollOrder(id: string, mockError: string | null, isCurrent: () => boolean): Promise<Order> {
  const started = Date.now();
  for (;;) {
    if (!isCurrent()) throw new DOMException("Aborted", "AbortError");
    const order = await getTradeStatus(id, mockError);
    if (!isCurrent()) throw new DOMException("Aborted", "AbortError");
    if (order.status === "confirmed" || order.status === "failed" || order.status === "expired") return order;
    if (Date.now() - started > POLL_BUDGET_MS) throw new ApiError("UPSTREAM", "La orden no confirmó a tiempo.");
    await sleep(POLL_MS);
  }
}

function solText(value: number) {
  return `${solFormatter.format(value)} SOL`;
}

function shownMoney(usd: number, currency: Currency, rate: number | null | undefined) {
  const value = displayPrice(usd, currency, rate ?? undefined);
  if (value === null) return formatMoney(usd, "USD");
  return formatMoney(value, currency);
}

function quoteRows(t: Messages, quote: TradeQuote, currency: Currency, rate: number | null | undefined) {
  const fee =
    quote.costs.platformFeeBps === 0
      ? t.trade.feeFree
      : fill(t.trade.feeLine, {
          percent: plainPercent.format(quote.costs.platformFeeBps / 10_000),
          amount: shownMoney(quote.costs.platformFeeUsd, currency, rate),
        });
  const fees = [
    { label: fill(t.trade.fee, { brand: site.name }), value: fee },
    { label: t.trade.network, value: solText(quote.costs.networkFeeSol) },
  ];
  if (quote.costs.tokenAccountRentSol > 0) {
    fees.push({ label: t.trade.rent, value: solText(quote.costs.tokenAccountRentSol) });
  }
  return {
    fees,
    details: [
      { label: t.trade.price, value: shownMoney(quote.pricePerShareUsd, currency, rate) },
      { label: t.trade.impact, value: plainPercent.format(quote.costs.priceImpactPct) },
      { label: t.trade.slippage, value: plainPercent.format(quote.costs.slippageBps / 10_000) },
    ],
  };
}

function blockCopy(
  t: Messages,
  block: AmountBlock | null,
  side: Side,
  amount: number,
  currency: Currency,
  rate: number | null | undefined,
  minUsd: number,
) {
  const minimum = shownMoney(minUsd, currency, rate);
  if (block === "min") return fill(t.trade.min, { amount: minimum });
  if (block === "funds" && !(amount > 0)) {
    return fill(side === "sell" ? t.trade.belowMinShares : t.trade.belowMin, { amount: minimum });
  }
  if (block === "funds") return side === "sell" ? t.trade.insufficientShares : t.trade.insufficient;
  if (block === "fx") return t.trade.noFx;
  if (block === "price") return t.trade.noPrice;
  return null;
}

/**
 * Barra fina de validez de la cotización: se vacía a medida que pasa el tiempo
 * y avisa en ámbar/rojo cuando queda poco. Sólo informa, no es interactiva.
 */
function QuoteValidityBar({ remainingMs, language }: { remainingMs: number; language: "es-CL" | "en" }) {
  const pct = Math.max(0, Math.min(100, (remainingMs / QUOTE_VALIDITY_MS) * 100));
  const tone = pct < 15 ? "bg-down" : pct < 30 ? "bg-warn" : "bg-fg";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={language === "en" ? "Quote validity" : "Validez de la cotización"}
      className="h-0.5 w-full overflow-hidden rounded-full bg-border"
    >
      <div
        className={cn(tone, "h-full rounded-full transition-[width,background-color] duration-1000 ease-linear motion-reduce:transition-none")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TradeMark({ ticker }: { ticker: Ticker }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <TickerLogo symbol={ticker.symbol} name={ticker.name} logoUrl={ticker.logo} size={32} decorative loading="eager" sizes="32px" />
      <div className="min-w-0">
        <p className="truncate text-[13px] leading-4 font-medium text-fg">{ticker.name}</p>
        <p className="num mt-1 truncate text-[12px] leading-4 uppercase tracking-[0.045em] text-fg-muted">{ticker.symbol}</p>
      </div>
    </div>
  );
}

/** Activo a la izquierda, precio estimado a la derecha. Contexto de todos los pasos. */
function TradeHeader({ ticker, priceLabel, price }: { ticker: Ticker; priceLabel: string; price: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <TradeMark ticker={ticker} />
      <div className="shrink-0 text-right">
        <p className="label">{priceLabel}</p>
        <p className="num mt-1 text-sm leading-5 font-medium text-fg">{price}</p>
      </div>
    </div>
  );
}

/** Frase con la cifra en `.num`: «Recibes ≈ 0,00412 acc. de NVIDIA». */
function AmountSentence({ template, amount, name }: { template: string; amount: string; name?: string }) {
  const [before = "", after = ""] = template.split("{amount}");
  return (
    <>
      {before}
      <span className="num font-medium text-fg">{amount}</span>
      {name ? after.split("{name}").join(name) : after}
    </>
  );
}

/** Fila de documento: rótulo mono a la izquierda, cifra mono a la derecha. */
function StatementRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-6 py-3">
      <dt className="label min-w-0">{label}</dt>
      <dd
        className={cn(
          "num text-right leading-5 text-fg",
          strong ? "text-[15px] font-medium" : "text-[13px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Vigencia de la cotización: una línea y la barra. Al vencer, el texto lo dice. */
function QuoteValidity({
  remainingMs,
  label,
  expiredLabel,
  language,
}: {
  remainingMs: number;
  label: string;
  expiredLabel: string;
  language: "es-CL" | "en";
}) {
  const expired = remainingMs <= 0;
  return (
    <div className="flex flex-col gap-2">
      <span className={cn("text-[12px] leading-4 tabular-nums", expired ? "font-medium text-down" : "text-fg-muted")}>
        {expired ? expiredLabel : label}
      </span>
      <QuoteValidityBar remainingMs={remainingMs} language={language} />
    </div>
  );
}

/** CTA primaria: el verbo queda a la izquierda y el monto dentro del botón. */
function ActionButton({
  amount,
  children,
  ...props
}: { amount?: string | null; children: ReactNode } & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Button size="lg" className="min-h-12 w-full touch-manipulation text-[15px] md:text-base" {...props}>
      {amount ? (
        <span className="flex w-full items-center justify-between gap-4">
          <span>{children}</span>
          <span className="num shrink-0 text-[13px] font-medium text-white/80">{amount}</span>
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Pie del paso: pegado al borde inferior de la hoja, a todo el ancho. Arriba va
 * el motivo cuando la acción está bloqueada, así el CTA no se mueve y el
 * usuario no tiene que buscar la explicación. El área segura la aporta la
 * propia barra.
 */
function SheetActionBar({
  reason,
  reasonId,
  tone = "muted",
  retry,
  retryLabel,
  children,
}: {
  reason?: string | null;
  reasonId?: string;
  tone?: "muted" | "down";
  retry?: (() => void) | null;
  retryLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-border bg-bg px-5 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:-mx-7 md:px-7 md:pb-4">
      {reason ? (
        <p
          id={reasonId}
          className={cn(
            "mb-2.5 text-[12px] leading-4 text-balance",
            tone === "down" ? "text-down" : "text-fg-muted",
          )}
        >
          {reason}
        </p>
      ) : null}
      {/* Los errores se anuncian una vez; el «Cotizando…» no interrumpe. */}
      <p role="status" aria-live="polite" className="sr-only">
        {tone === "down" && reason ? reason : ""}
      </p>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="mb-1 inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
        >
          {retryLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}

const usdcChipFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const sharesChipFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 6 });

function quickChipLabel(value: number, currency: "USDC" | "SHARES"): string {
  if (currency === "SHARES") return sharesChipFormat.format(value);
  return `US$ ${usdcChipFormat.format(value)}`;
}

/**
 * Barra del botón principal: la define `SheetActionBar` más arriba.
 */
function TradeFlow({ side, ticker, onBusyChange }: { side: Side; ticker: Ticker; onBusyChange: (busy: boolean) => void }) {
  const { t, currency: displayCurrency, language } = useT();
  const session = useSession();
  const { mode } = useAccountMode();
  const sign = useSignTrade();
  const queryClient = useQueryClient();
  const portfolio = usePortfolio();
  const prices = usePrices([ticker.symbol], true, SPOT_MS);
  const market = useMarketStatus();
  const asset = useAssetStatus(ticker.symbol);
  const hintId = useId();
  const reasonId = useId();
  const [amountRaw, setAmountRaw] = useState("");
  const [currency, setCurrency] = useState<"USDC" | "SHARES">(side === "sell" ? "SHARES" : "USDC");
  const [orderMode, setOrderMode] = useState<"market" | "limit">("market");
  const [targetPriceRaw, setTargetPriceRaw] = useState("");
  const [expiry, setExpiry] = useState<LimitOrderExpiry>("7d");
  const [limitResult, setLimitResult] = useState<LimitOrder | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [quoteState, setQuoteState] = useState<LiveQuote>(idleQuote);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [result, setResult] = useState<Order | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [mockError] = useState(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("mockError")?.trim();
    return code ? code : null;
  });
  const seqRef = useRef(0);
  const mounted = useRef(true);
  const confirming = useRef(false);

  const isEnglish = language === "en";
  const doc = isEnglish
    ? { folio: "Order ID", date: "Date", receive: "You receive", deliver: "You deliver", paid: "Total paid", received: "Total received" }
    : { folio: "Folio", date: "Fecha", receive: "Recibes", deliver: "Entregas", paid: "Total pagado", received: "Total recibido" };
  const wallet = session.user?.walletAddress?.trim() ?? "";
  const userId = session.user?.id?.trim() ?? "";
  const limitEnabled = mode === "demo" && session.status === "authenticated" && userId.length > 0;
  const isLimit = limitEnabled && orderMode === "limit";
  // La cuenta demo no tiene billetera: se firma con el id de usuario (uuid ≥ 32).
  const pubkey = wallet.length >= 32 ? wallet : mode === "demo" && userId.length >= 32 ? userId : null;
  const position = portfolio.data?.positions.find((item) => item.symbol === ticker.symbol) ?? null;
  const shares = position?.shares ?? 0;
  const cashUsdc = portfolio.data?.cashUsdc ?? 0;
  const priceUsd = prices.data?.find((item) => item.symbol === ticker.symbol)?.priceUsd ?? null;
  const fxRate = null;
  const amount = parseAmount(amountRaw);
  const portfolioPending = portfolio.isPending;
  const quoteAmount = amount;
  const quoteCurrency = currency;
  // Mínimo por orden del activo (M39/M43b): un solo mínimo coherente, el máximo
  // entre el global y el de la acción. La validación y el mensaje usan el mismo.
  const halted = asset.data?.halted === true;
  const minUsd = effectiveMinOrderUsd(asset.data?.minOrderUsd);
  const parsedTargetPrice = parseAmount(targetPriceRaw.replace(",", "."));
  const validTargetPrice = parsedTargetPrice > 0;
  function nudgeLimitPrice(cents: number) {
    const base = parsedTargetPrice || priceUsd || 0;
    setTargetPriceRaw((Math.max(1, Math.round(base * 100) + cents) / 100).toFixed(2));
  }
  const sizingPriceUsd = isLimit ? parsedTargetPrice || null : priceUsd;
  const block = amountBlock({
    side,
    currency,
    amount,
    cashUsdc,
    shares,
    fx: fxRate,
    priceUsd: sizingPriceUsd,
    fxPending: false,
    pricePending: !isLimit && prices.isPending,
    portfolioPending,
    minUsd,
  });
  const limitAmountUsd = validTargetPrice ? (currency === "SHARES" ? amount * parsedTargetPrice : amount) : 0;
  const requestKey =
    !isLimit && block === null
      ? `${side}|${ticker.symbol}|${quoteCurrency}|${quoteAmount}|${refreshKey}|${mockError ?? ""}`
      : "";
  const live = quoteState.key === requestKey ? quoteState : idleQuote;
  const quote = live.quote;
  const quoting = live.pending;
  const quoteError = live.error;
  const fresh = quote !== null && !quoting && quoteError === null;
  const remainingMs = quote ? Date.parse(quote.expiresAt) - now : 0;
  const currencies = side === "sell" ? SELL_CURRENCIES : BUY_CURRENCIES;
  const cap = portfolioPending ? null : maxAmount({ side, currency, cashUsdc, shares, fx: fxRate, priceUsd: sizingPriceUsd });
  const busy = phase === "signing" || phase === "submitting" || phase === "done" || phase === "error";
  const minHelp = fill(t.trade.minOrder, { amount: shownMoney(minUsd, displayCurrency, fxRate) });
  // Montos rápidos (M43b): nunca bajo el mínimo efectivo; sin pasar el
  // disponible cuando se puede. La UI conserva el chip Máx.
  const quickValues = quickTradeAmounts(currency, { minUsd, fx: fxRate, priceUsd: sizingPriceUsd, max: cap });
  const quickChips = [
    ...quickValues.map((value) => ({ label: quickChipLabel(value, currency), value })),
    { label: t.trade.max, value: "max" as const },
  ];
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase === "review" && !isLimit) preloadTradeConfirmationWave();
  }, [phase, isLimit]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (busy || !requestKey) return;
    const seq = ++seqRef.current;
    const key = requestKey;
    const handle = window.setTimeout(() => {
      if (seq !== seqRef.current) return;
      setQuoteState({ key, quote: null, error: null, pending: true });
      void quoteTrade(
        {
          side,
          symbol: ticker.symbol,
          amount: quoteAmount,
          amountCurrency: quoteCurrency,
          ...(pubkey ? { userPublicKey: pubkey } : {}),
        },
        mockError,
      )
        .then((next) => {
          if (seq !== seqRef.current || !mounted.current) return;
          setQuoteState({ key, quote: next, error: null, pending: false });
        })
        .catch((error: unknown) => {
          if (seq !== seqRef.current || !mounted.current) return;
          setQuoteState({
            key,
            quote: null,
            error: failureMessage(t, error) ?? t.trade.errors.UPSTREAM,
            pending: false,
          });
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
      seqRef.current += 1;
    };
  }, [amount, busy, currency, mockError, pubkey, quoteAmount, quoteCurrency, requestKey, side, t, ticker.symbol]);

  useEffect(() => {
    if (!quote || busy) return;
    const left = Date.parse(quote.expiresAt) - Date.now();
    const handle = window.setTimeout(() => setRefreshKey((key) => key + 1), Math.max(left, 0) + 30);
    return () => window.clearTimeout(handle);
  }, [busy, quote]);

  async function confirm() {
    if (confirming.current || !quote || !fresh || quoting || remainingMs <= 0) return;
    if (!pubkey) {
      setFlowError(t.trade.noWallet);
      setPhase("error");
      return;
    }
    confirming.current = true;
    onBusyChange(true);
    const current = quote;
    setPhase("signing");
    setFlowError(null);
    try {
      const built = await buildTrade({ quoteId: current.id, userPublicKey: pubkey }, mockError);
      if (!mounted.current) return;
      const signed = mode === "demo" ? await signDemoTransaction(built.transactionBase64) : await sign(built.transactionBase64);
      if (!mounted.current) return;
      setPhase("submitting");
      const submitted = await submitTrade(
        { requestId: built.requestId, signedTransactionBase64: signed },
        mockError,
      );
      if (!mounted.current) return;
      const order = await pollOrder(submitted.orderId, mockError, () => mounted.current);
      if (!mounted.current) return;
      if (order.status !== "confirmed") {
        setFlowError(orderFailure(t, order));
        setPhase("error");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      setResult(order);
      setPhase("done");
    } catch (error) {
      if (!mounted.current) return;
      const message = failureMessage(t, error);
      if (!message) return;
      setFlowError(message);
      setPhase("error");
    } finally {
      confirming.current = false;
      onBusyChange(false);
    }
  }

  if (portfolioPending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    );
  }

  if (isRealAccountUiBlocked(mode)) {
    return <RealAccountEmpty />;
  }

  if (portfolio.isError) {
    return (
      <ErrorState
        title={t.detail.positionError}
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={() => {
          void portfolio.refetch();
        }}
      />
    );
  }

  if (side === "sell" && !(shares > 0)) {
    return (
      <div className="flex flex-col gap-4">
        <TradeMark ticker={ticker} />
        <p className="text-sm leading-relaxed text-fg-body">
          {fill(t.detail.tradeNoPosition, { symbol: ticker.symbol })}
        </p>
      </div>
    );
  }

  if (phase === "signing" || phase === "submitting") {
    // El stepper trae su propio role="status" aria-live="polite".
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <TradeHeader
          ticker={ticker}
          priceLabel={t.trade.price}
          price={priceUsd ? shownMoney(priceUsd, displayCurrency, fxRate) : "—"}
        />
        <TradeExecutionStepper
          phase={phase}
          signingLabel={t.trade.signing}
          submittingLabel={t.trade.submitting}
        />
        {quote ? (
          <div className="mt-auto flex items-baseline justify-between gap-6 border-t border-border pt-4">
            <span className="text-[12px] leading-4 text-fg-muted">{t.trade.youReceive}</span>
            <span className="num text-right text-sm leading-5 text-fg">
              {side === "buy" ? formatShares(quote.outAmountUi) : shownMoney(quote.outAmountUi, displayCurrency, fxRate)}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  if (phase === "done" && limitResult) {
    const expiryText =
      limitResult.expiry === "7d"
        ? isEnglish
          ? "7 days"
          : "7 días"
        : limitResult.expiry === "30d"
          ? isEnglish
            ? "30 days"
            : "30 días"
          : isEnglish
            ? "Good 'til cancelled"
            : "Hasta cancelar";
    const sideText =
      limitResult.side === "buy" ? (isEnglish ? "Buy" : "Compra") : isEnglish ? "Sell" : "Venta";

    return (
      <div role="status" aria-live="polite" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-6 pb-8">
          <div className="relative isolate flex items-start gap-3 overflow-hidden rounded-2xl border border-border bg-bg p-3.5 sm:p-4">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-surface-1 motion-safe:animate-fade-in" />
            <span
              aria-hidden="true"
              className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warn-bg text-warn"
            >
              <IconClock className="size-4" />
            </span>
            <div className="relative min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <p className="text-xl leading-tight text-fg">
                  {isEnglish ? "Demo order saved" : "Orden demo guardada"}
                </p>
                <Badge tone="warn">{isEnglish ? "Pending" : "Pendiente"}</Badge>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-body">
                {isEnglish
                  ? `${sideText} · ${ticker.name}`
                  : `${sideText} de ${ticker.name}`}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-border border-y border-border">
            <StatementRow label={doc.folio} value={`#MV-${limitResult.id.slice(0, 8).toUpperCase()}`} />
            <StatementRow label={doc.date} value={formatDateTime(limitResult.createdAt)} />
            <StatementRow label={isEnglish ? "Order type" : "Tipo de orden"} value={isEnglish ? "Limit" : "Límite"} />
            <StatementRow
              label={isEnglish ? "Limit price" : "Precio límite"}
              value={formatUnitPrice(limitResult.targetPriceUsd, "USD", language)}
            />
            <StatementRow label={isEnglish ? "Expiry" : "Vigencia"} value={expiryText} />
            <StatementRow
              label={isEnglish ? "Order amount" : "Monto de la orden"}
              value={shownMoney(limitResult.amountUsd, displayCurrency, fxRate)}
              strong
            />
          </dl>

          <p className="text-[12px] leading-relaxed text-fg-muted">
            {isEnglish
              ? "Saved in this browser for the demo. This order does not execute or reserve funds."
              : "Se guarda en este navegador para la demo. La orden no se ejecuta ni reserva fondos."}
          </p>
        </div>

        <SheetActionBar>
          <Button
            type="button"
            size="lg"
            className="min-h-12 w-full"
            onClick={() => {
              setLimitResult(null);
              setAmountRaw("");
              setPhase("form");
            }}
          >
            {isEnglish ? "Back to orders" : "Volver a órdenes"}
          </Button>
        </SheetActionBar>
      </div>
    );
  }

  if (phase === "done" && result) {
    const summary =
      result.side === "buy"
        ? fill(t.trade.doneBuy, { amount: formatShares(result.outAmountUi), name: ticker.name })
        : fill(t.trade.doneSell, { amount: formatShares(result.inAmountUi), name: ticker.name });
    const totalLabel = result.side === "buy" ? doc.paid : doc.received;
    const totalValue = shownMoney(
      result.side === "buy" ? result.inAmountUi : result.outAmountUi,
      displayCurrency,
      fxRate,
    );
    return (
      <div role="status" aria-live="polite" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-6 pb-8">
          <TradeConfirmationHeading key={result.id} title={t.trade.done} summary={summary} animate={result.status === "confirmed"} />

          <dl className="divide-y divide-border border-y border-border">
            <StatementRow label={doc.folio} value={`#MV-${result.id.slice(0, 8).toUpperCase()}`} />
            <StatementRow label={doc.date} value={formatDateTime(result.createdAt)} />
            <StatementRow
              label={result.side === "buy" ? doc.receive : doc.deliver}
              value={
                result.side === "buy"
                  ? `${formatShares(result.outAmountUi)} ${ticker.symbol}`
                  : formatShares(result.inAmountUi)
              }
            />
            <StatementRow label={totalLabel} value={totalValue} strong />
            {quote ? (
              <StatementRow
                label={fill(t.trade.fee, { brand: site.name })}
                value={
                  quote.costs.platformFeeBps === 0
                    ? t.trade.feeFree
                    : plainPercent.format(quote.costs.platformFeeBps / 10_000)
                }
              />
            ) : null}
          </dl>

          <p className="text-[12px] leading-relaxed text-fg-muted">Enrutamiento Jupiter Spot → Solana SPL.</p>
        </div>

        <SheetActionBar>
          <div className="flex flex-col gap-1">
            <Button asChild size="lg" className="min-h-12 w-full text-[15px] md:text-base">
              <Link href="/app/cartera">{t.trade.portfolio}</Link>
            </Button>
            {result.signature ? (
              <a
                href={explorerTxUrl(result.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
              >
                {t.trade.explorer}
                <span className="sr-only"> {t.trade.explorerNew}</span>
                <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : null}
          </div>
        </SheetActionBar>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div role="alert" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3 pt-1 pb-8">
          <p className="label text-down">{t.states.error}</p>
          <p className="text-xl leading-snug text-balance text-fg">{flowError ?? t.trade.orderFailed}</p>
        </div>
        <SheetActionBar>
          <Button
            size="lg"
            className="min-h-12 w-full text-[15px] md:text-base"
            onClick={() => {
              setFlowError(null);
              setPhase("form");
              setRefreshKey((key) => key + 1);
            }}
          >
            {t.states.retry}
          </Button>
        </SheetActionBar>
      </div>
    );
  }

  const hint = isLimit && !validTargetPrice ? null : blockCopy(t, block, side, amount, displayCurrency, fxRate, minUsd);
  const showDeposit = !isLimit && side === "buy" && block === "funds";
  const canReview = block === null && fresh && !quoting && !quoteError && !halted;
  const canSubmitLimit = isLimit && block === null && validTargetPrice && Number.isFinite(limitAmountUsd) && limitAmountUsd > 0 && !halted;
  const canConfirm = phase === "review" && canReview && remainingMs > 0 && pubkey !== null && !halted;
  // Monto que se juega en el paso: pagado al comprar, recibido al vender.
  const ctaAmount = isLimit
    ? limitAmountUsd > 0
      ? shownMoney(limitAmountUsd, displayCurrency, fxRate)
      : null
    : quote && fresh
      ? shownMoney(side === "buy" ? quote.inAmountUi : quote.outAmountUi, displayCurrency, fxRate)
      : null;
  const retry =
    !isLimit && quoteError !== null
      ? () => setRefreshKey((key) => key + 1)
      : !isLimit && block === "price"
        ? () => void prices.refetch()
        : null;
  const limitTargetError =
    isLimit && !validTargetPrice
      ? isEnglish
        ? "Enter a valid limit price."
        : "Ingresa un precio límite válido."
      : null;
  // Un solo motivo, junto al botón: por qué no se puede avanzar todavía.
  const reason = halted
    ? t.detail.tradeHaltedNote
    : !isLimit && quoteError
      ? quoteError
      : block === "wait"
        ? t.states.loading
        : hint
          ? hint
          : limitTargetError
            ? limitTargetError
            : !isLimit && (quoting || (block === null && !quote))
              ? t.trade.quoting
              : !isLimit && !pubkey && phase === "review"
                ? t.trade.noWallet
                : null;
  const reasonTone = halted || (!isLimit && quoteError !== null) || hint || limitTargetError ? "down" : "muted";
  const estimate = quote
    ? side === "buy"
      ? fill(t.trade.receiveBuy, { amount: formatShares(quote.outAmountUi), name: ticker.name })
      : fill(t.trade.receiveSell, { amount: shownMoney(quote.outAmountUi, displayCurrency, fxRate) })
    : null;
  const availableValue =
    side === "buy"
      ? shownMoney(cashUsdc, displayCurrency, fxRate)
      : currency === "SHARES"
        ? formatShares(shares)
        : sizingPriceUsd && sizingPriceUsd > 0
          ? shownMoney(shares * sizingPriceUsd, displayCurrency, fxRate)
          : null;
  const availableLabel = templateLabel(
    side === "sell" && currency === "SHARES" ? t.trade.holding : t.trade.available,
  );
  const labels = { USDC: "USD", SHARES: t.trade.shares } as const;

  if (phase === "review") {
    const reviewQuote = fresh ? quote : null;
    const breakdown = reviewQuote ? quoteRows(t, reviewQuote, displayCurrency, fxRate) : null;
    const buying = side === "buy";
    const from = reviewQuote
      ? buying
        ? shownMoney(reviewQuote.inAmountUi, displayCurrency, fxRate)
        : `${formatShares(reviewQuote.inAmountUi)} ${ticker.symbol}`
      : "—";
    const to = reviewQuote
      ? buying
        ? `${formatShares(reviewQuote.outAmountUi)} ${ticker.symbol}`
        : shownMoney(reviewQuote.outAmountUi, displayCurrency, fxRate)
      : "—";

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-6 pb-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPhase("form")}
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors outline-none hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              <IconBack className="size-4" aria-hidden="true" />
              {t.trade.back}
            </button>
            <span className="num text-[12px] uppercase tracking-[0.045em] text-fg-muted">{ticker.symbol}</span>
          </div>

          <QuoteExchangeSummary
            label={isEnglish ? "Estimated exchange" : "Montos estimados"}
            fromLabel={buying ? (isEnglish ? "You pay" : "Pagas") : (isEnglish ? "You sell" : "Vendes")}
            toLabel={t.trade.youReceive}
            from={from}
            to={to}
            feeLabel={isEnglish ? "Fees and network costs" : "Comisiones y costos de red"}
            fees={breakdown?.fees}
          />

          {quote && !quoting && !quoteError ? (
            <QuoteValidity
              remainingMs={remainingMs}
              label={fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}
              expiredLabel={t.trade.errors.QUOTE_EXPIRED}
              language={language}
            />
          ) : null}

          {halted ? (
            <MarketStatusPill open={false} halted label={t.detail.assetHalted} />
          ) : asset.data && (asset.data.period !== "market" || !asset.data.openNow) ? (
            <MarketStatusPill
              open={false}
              label={
                asset.data.period === "extended"
                  ? t.detail.assetExtended
                  : asset.data.period === "overnight"
                    ? t.detail.assetOvernight
                    : asset.data.period === "closed"
                      ? t.detail.assetClosed
                      : t.market.offHours
              }
            />
          ) : market.data && market.data.session !== "regular" ? (
            <MarketStatusPill open={false} label={market.data.session === "closed" ? t.market.closed : t.market.offHours} />
          ) : null}

          {breakdown ? <Accordion items={[{
            id: "details",
            title: isEnglish ? "Execution details" : "Detalle de ejecución",
            content: <CostBreakdown rows={breakdown.details} />,
          }]} /> : null}

          {fresh && quote ? (
            <TradeImpactPreview
              side={side}
              symbol={ticker.symbol}
              currentShares={shares}
              deltaShares={side === "buy" ? quote.outAmountUi : quote.inAmountUi}
              currentValueUsd={position?.valueUsd ?? 0}
              orderUsd={side === "buy" ? quote.inAmountUi : quote.outAmountUi}
              totalPortfolioUsd={portfolio.data?.totalUsd ?? cashUsdc}
              cashUsdc={cashUsdc}
              currency={displayCurrency}
              rate={fxRate}
            />
          ) : null}


          {/* M83: aviso antes de confirmar. Texto borrador hasta la revisión
              del abogado; si la exige, cambia en un solo lugar. */}
          <p className="text-[12px] leading-relaxed text-fg-muted">
            El precio puede variar. Operación ejecutada en Solana vía Jupiter. No es asesoría.{" "}
            <span className="font-medium text-warn">[REVISIÓN ABOGADO]</span>
          </p>

          <Link
            href="/legal/riesgos"
            className="inline-flex min-h-11 w-fit items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4 outline-none transition-colors hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            {t.detail.risksLink}
          </Link>
        </div>

        <SheetActionBar reason={reason} reasonId={reasonId} tone={reasonTone} retry={retry} retryLabel={t.states.retry}>
          <ActionButton
            disabled={!canConfirm}
            onClick={() => void confirm()}
            amount={ctaAmount}
            aria-describedby={reason ? reasonId : undefined}
          >
            {t.trade.confirm}
          </ActionButton>
        </SheetActionBar>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-5 pb-8">
        <TradeHeader
          ticker={ticker}
          priceLabel={t.trade.price}
          price={priceUsd ? shownMoney(priceUsd, displayCurrency, fxRate) : "—"}
        />

        {limitEnabled ? (
          <div className="flex items-center justify-between gap-3 border-y border-border py-2.5 text-sm font-medium">
            <label htmlFor={`${hintId}-order-type`}>{isEnglish ? "Order type" : "Tipo de orden"}</label>
            <select
              id={`${hintId}-order-type`}
              value={isLimit ? "limit" : "market"}
              onChange={(event) => setOrderMode(event.target.value === "limit" ? "limit" : "market")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            >
              <option value="market">{isEnglish ? "Market" : "A mercado"}</option>
              <option value="limit">{isEnglish ? "Limit" : "Límite"}</option>
            </select>
          </div>
        ) : null}

        {isLimit ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={hintId + "-target"} className="label">
              {isEnglish ? "Limit price per share (USD)" : "Precio límite por acción (USD)"}
            </label>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center rounded-lg border border-border bg-bg px-1">
              <button
                type="button"
                aria-label={isEnglish ? "Decrease limit price" : "Bajar precio límite"}
                onClick={() => nudgeLimitPrice(-1)}
                className="size-11 rounded-md hover:bg-surface-1"
              >−</button>
              <Input
                id={hintId + "-target"}
                type="text"
                inputMode="decimal"
                value={targetPriceRaw}
                onChange={(event) => setTargetPriceRaw(event.target.value)}
                placeholder="0.00"
                aria-invalid={!validTargetPrice && targetPriceRaw !== ""}
                className="num border-0 text-center"
              />
              <button
                type="button"
                aria-label={isEnglish ? "Increase limit price" : "Subir precio límite"}
                onClick={() => nudgeLimitPrice(1)}
                className="size-11 rounded-md hover:bg-surface-1"
              >+</button>
            </div>
          </div>
        ) : null}

        <AmountInput
          id={`${hintId}-amount`}
          label={t.trade.amount}
          value={amountRaw}
          onChange={setAmountRaw}
          currency={currency}
          currencies={currencies}
          currencyLabel={t.trade.currency}
          labels={labels}
          maxLabel={t.trade.max}
          suffix={currency === "SHARES" ? t.trade.shareSuffix : undefined}
          max={cap ?? undefined}
          describedBy={hint ? reasonId : undefined}
          invalid={block === "min" || block === "funds"}
          chips={quickChips}
          caption={
            <p aria-live="polite">
              {fresh && quote && estimate ? (
                <AmountSentence
                  template={side === "buy" ? t.trade.receiveBuy : t.trade.receiveSell}
                  amount={
                    side === "buy"
                      ? formatShares(quote.outAmountUi)
                      : shownMoney(quote.outAmountUi, displayCurrency, fxRate)
                  }
                  name={ticker.name}
                />
              ) : null}
            </p>
          }
          onCurrencyChange={(next) => {
            if (next !== "USDC" && next !== "SHARES") return;
            setAmountRaw(convertAmount(amount, currency, next, fxRate, sizingPriceUsd));
            setCurrency(next);
          }}
        />

        {side === "sell" && shares > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {([
              { pct: 0.25, label: "25%" },
              { pct: 0.5, label: "50%" },
              { pct: 0.75, label: "75%" },
              { pct: 1, label: "100%" },
            ] as const).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const base =
                    currency === "SHARES"
                      ? shares * preset.pct
                      : sizingPriceUsd
                        ? Number((shares * sizingPriceUsd * preset.pct).toFixed(2))
                        : 0;
                  setAmountRaw(String(Number(base.toFixed(6))));
                }}
                className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-md px-3 text-[12px] font-medium whitespace-nowrap tabular-nums text-fg-muted transition-colors duration-150 outline-none hover:bg-surface-1 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}

        {isLimit ? (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <div className="flex flex-col gap-1.5">
              <span className="label">{isEnglish ? "Expiry" : "Vigencia"}</span>
              <SegmentedControl
                label={isEnglish ? "Limit order expiry" : "Vigencia de la orden límite"}
                value={expiry}
                onChange={(next) => {
                  if (next === "7d" || next === "30d" || next === "gtc") {
                    setExpiry(next);
                  }
                }}
                fullWidth
                compact
                options={[
                  { value: "7d", label: isEnglish ? "7 days" : "7 días" },
                  { value: "30d", label: isEnglish ? "30 days" : "30 días" },
                  { value: "gtc", label: isEnglish ? "Good 'til cancelled" : "Hasta cancelar" },
                ]}
              />
            </div>

            <p className="text-[12px] leading-relaxed text-fg-muted">
              {isEnglish
                ? "Saved in this browser for the demo. This order does not execute or reserve funds."
                : "Se guarda en este navegador para la demo. La orden no se ejecuta ni reserva fondos."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-6">
            <span className="text-[12px] leading-4 text-fg-muted">{availableLabel}</span>
            <span className="num text-[13px] leading-4 font-medium text-fg">{availableValue ?? "—"}</span>
          </div>
          {side === "buy" ? <p className="text-[12px] leading-4 text-fg-muted">{minHelp}</p> : null}
        </div>

        {isLimit ? <LimitOrdersPanel symbol={ticker.symbol} ordersOnly /> : null}

        {!isLimit && quote && !quoting && !quoteError ? (
          <QuoteValidity
            remainingMs={remainingMs}
            label={fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}
            expiredLabel={t.trade.errors.QUOTE_EXPIRED}
            language={language}
          />
        ) : !isLimit ? (
          // Reserva el alto de la línea + barra: cotizar no mueve el formulario.
          <div aria-hidden="true" className="h-[1.625rem]" />
        ) : null}
      </div>

      <SheetActionBar reason={reason} reasonId={reasonId} tone={reasonTone} retry={retry} retryLabel={t.states.retry}>
        {showDeposit ? (
          <Button asChild size="lg" className="min-h-12 w-full touch-manipulation text-[15px] md:text-base">
            <Link href={DEPOSIT_HREF}>{t.trade.deposit}</Link>
          </Button>
        ) : isLimit ? (
          <ActionButton
            disabled={!canSubmitLimit}
            onClick={() => {
              if (!canSubmitLimit) return;
              const created = addLimitOrder({
                symbol: ticker.symbol,
                name: ticker.name,
                side,
                amountUsd: limitAmountUsd,
                targetPriceUsd: parsedTargetPrice,
                ownerId: userId,
                expiry,
              });
              setLimitResult(created);
              setPhase("done");
            }}
            amount={ctaAmount}
            aria-describedby={reason ? reasonId : undefined}
          >
            {isEnglish ? "Save demo order" : "Guardar orden demo"}
          </ActionButton>
        ) : (
          <ActionButton
            disabled={!canReview}
            onClick={() => setPhase("review")}
            amount={ctaAmount}
            aria-describedby={reason ? reasonId : undefined}
          >
            {t.trade.review}
          </ActionButton>
        )}
      </SheetActionBar>
    </div>
  );
}

/** Sheet de compra o venta. Lo abre `?operar=comprar|vender` en el detalle. */
export function TradeSheet({
  open,
  side,
  ticker,
  onOpenChange,
  onSideChange,
  allowBuy = true,
  allowSell = true,
}: {
  open: boolean;
  side: Side;
  ticker: Ticker;
  onOpenChange: (open: boolean) => void;
  onSideChange?: (side: Side) => void;
  allowBuy?: boolean;
  allowSell?: boolean;
}) {
  const { t, language } = useT();
  const [executing, setExecuting] = useState(false);
  const title = fill(side === "sell" ? t.detail.tradeSell : t.detail.tradeBuy, { name: ticker.name });

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!executing) onOpenChange(next); }} title={title} fill dismissible={!executing}>
      {onSideChange ? <div className="mb-4 shrink-0"><SegmentedControl label={language === "en" ? "Operation" : "Operación"} value={side} fullWidth options={[{ value: "buy", label: t.detail.buy, disabled: executing || !allowBuy }, { value: "sell", label: t.detail.sell, disabled: executing || !allowSell }]} onChange={(next) => { if (!executing && (next === "buy" ? allowBuy : allowSell)) onSideChange(next === "sell" ? "sell" : "buy"); }} /></div> : null}
      <TradeFlow key={`${side}:${ticker.symbol}`} side={side} ticker={ticker} onBusyChange={setExecuting} />
    </Sheet>
  );
}
