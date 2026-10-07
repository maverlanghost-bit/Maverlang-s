"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { MarketStatusPill } from "@/components/domain/market-status-pill";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";
import { QUOTE_DEBOUNCE_MS } from "@/config/trade";
import type { Messages } from "@/content/i18n/es-CL";
import { ApiError, buildTrade, getTradeStatus, quoteTrade, submitTrade } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useSignTrade } from "@/lib/auth/sign-transaction";
import { formatMoney, formatShares } from "@/lib/format";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { SPOT_MS, useAssetStatus, useFx, useMarketStatus, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { effectiveMinOrderUsd } from "@/lib/market/asset-status.shared";
import {
  amountBlock,
  convertAmount,
  maxAmount,
  parseAmount,
  quickTradeAmounts,
  type AmountBlock,
  type TradeAmountCurrency,
} from "@/lib/trade/amount";
import type { Currency, Order, Side, Ticker, TradeQuote } from "@/lib/types";

const DEPOSIT_HREF = "/app/billetera/depositar";
const POLL_MS = 1_000;
const POLL_BUDGET_MS = 20_000;

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

function costRows(t: Messages, quote: TradeQuote, side: Side, currency: Currency, rate: number | null | undefined) {
  const fee =
    quote.costs.platformFeeBps === 0
      ? t.trade.feeFree
      : fill(t.trade.feeLine, {
          percent: plainPercent.format(quote.costs.platformFeeBps / 10_000),
          amount: shownMoney(quote.costs.platformFeeUsd, currency, rate),
        });
  const rows = [
    { label: t.trade.price, value: shownMoney(quote.pricePerShareUsd, currency, rate) },
    {
      label: t.trade.youReceive,
      value: side === "buy" ? formatShares(quote.outAmountUi) : shownMoney(quote.outAmountUi, currency, rate),
    },
    { label: fill(t.trade.fee, { brand: site.name }), value: fee },
    { label: t.trade.network, value: solText(quote.costs.networkFeeSol) },
  ];
  if (quote.costs.tokenAccountRentSol > 0) {
    rows.push({ label: t.trade.rent, value: solText(quote.costs.tokenAccountRentSol) });
  }
  rows.push(
    { label: t.trade.impact, value: plainPercent.format(quote.costs.priceImpactPct) },
    { label: t.trade.slippage, value: plainPercent.format(quote.costs.slippageBps / 10_000) },
  );
  return rows;
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

function Spinner() {
  return (
    <svg className="size-5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TradeMark({ ticker }: { ticker: Ticker }) {
  return (
    <div className="flex items-center gap-3">
      <TickerLogo symbol={ticker.symbol} name={ticker.name} logoUrl={ticker.logo} size={40} decorative />
      <div className="min-w-0">
        <p className="truncate font-medium text-fg">{ticker.name}</p>
        <p className="truncate text-sm text-fg-muted">{ticker.symbol}</p>
      </div>
    </div>
  );
}

const clpChipFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const usdcChipFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const sharesChipFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 6 });

function quickChipLabel(value: number, currency: TradeAmountCurrency): string {
  if (currency === "CLP") return `$${clpChipFormat.format(value)}`;
  if (currency === "SHARES") return sharesChipFormat.format(value);
  return `US$ ${usdcChipFormat.format(value)}`;
}

function TradeFlow({ side, ticker }: { side: Side; ticker: Ticker }) {
  const { t, currency: displayCurrency } = useT();
  const session = useSession();
  const { mode } = useAccountMode();
  const sign = useSignTrade();
  const queryClient = useQueryClient();
  const portfolio = usePortfolio();
  const prices = usePrices([ticker.symbol], true, SPOT_MS);
  const fx = useFx();
  const market = useMarketStatus();
  const asset = useAssetStatus(ticker.symbol);
  const hintId = useId();
  const [amountRaw, setAmountRaw] = useState("");
  const [currency, setCurrency] = useState<TradeAmountCurrency>(side === "sell" ? "SHARES" : "USDC");
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

  const wallet = session.user?.walletAddress?.trim() ?? "";
  const userId = session.user?.id?.trim() ?? "";
  // La cuenta demo no tiene billetera: se firma con el id de usuario (uuid ≥ 32).
  const pubkey = wallet.length >= 32 ? wallet : mode === "demo" && userId.length >= 32 ? userId : null;
  const position = portfolio.data?.positions.find((item) => item.symbol === ticker.symbol) ?? null;
  const shares = position?.shares ?? 0;
  const cashUsdc = portfolio.data?.cashUsdc ?? 0;
  const priceUsd = prices.data?.find((item) => item.symbol === ticker.symbol)?.priceUsd ?? null;
  const fxRate = fx.data?.rate ?? null;
  const amount = parseAmount(amountRaw);
  const portfolioPending = portfolio.isPending;
  // Las órdenes se ejecutan en dólares (M40): el monto en CLP se convierte a USD antes de cotizar.
  const quoteAmount = currency === "CLP" && fxRate && fxRate > 0 ? amount / fxRate : amount;
  const quoteCurrency = currency === "CLP" ? "USDC" : currency;
  // Mínimo por orden del activo (M39/M43b): un solo mínimo coherente, el máximo
  // entre el global y el de la acción. La validación y el mensaje usan el mismo.
  const halted = asset.data?.halted === true;
  const minUsd = effectiveMinOrderUsd(asset.data?.minOrderUsd);
  const block = amountBlock({
    side,
    currency,
    amount,
    cashUsdc,
    shares,
    fx: fxRate,
    priceUsd,
    fxPending: fx.isPending,
    pricePending: prices.isPending,
    portfolioPending,
    minUsd,
  });
  const requestKey =
    block === null
      ? `${side}|${ticker.symbol}|${quoteCurrency}|${quoteAmount}|${refreshKey}|${mockError ?? ""}`
      : "";
  const live = quoteState.key === requestKey ? quoteState : idleQuote;
  const quote = live.quote;
  const quoting = live.pending;
  const quoteError = live.error;
  const fresh = quote !== null && !quoting && quoteError === null;
  const remainingMs = quote ? Date.parse(quote.expiresAt) - now : 0;
  const currencies = side === "sell" ? SELL_CURRENCIES : BUY_CURRENCIES;
  const cap = portfolioPending ? null : maxAmount({ side, currency, cashUsdc, shares, fx: fxRate, priceUsd });
  const busy = phase === "signing" || phase === "submitting" || phase === "done" || phase === "error";
  const minHelp = fill(t.trade.minOrder, { amount: shownMoney(minUsd, displayCurrency, fxRate) });
  // Montos rápidos (M43b): nunca bajo el mínimo efectivo; sin pasar el
  // disponible cuando se puede. La UI conserva el chip Máx.
  const quickValues = quickTradeAmounts(currency, { minUsd, fx: fxRate, priceUsd, max: cap });
  const quickChips = [
    ...quickValues.map((value) => ({ label: quickChipLabel(value, currency), value })),
    { label: t.trade.max, value: "max" as const },
  ];
  const dollarsNote =
    currency === "CLP" && fxRate && fxRate > 0 && amount > 0
      ? fill(t.trade.executesInDollars, { amount: formatMoney(amount / fxRate, "USD") })
      : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
    const current = quote;
    setPhase("signing");
    setFlowError(null);
    try {
      const built = await buildTrade({ quoteId: current.id, userPublicKey: pubkey }, mockError);
      if (!mounted.current) return;
      const signed = await sign(built.transactionBase64);
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

  if (mode === "real") {
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
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
        <Spinner />
        <p className="text-lg text-fg">{phase === "signing" ? t.trade.signing : t.trade.submitting}</p>
      </div>
    );
  }

  if (phase === "done" && result) {
    const summary =
      result.side === "buy"
        ? fill(t.trade.doneBuy, { amount: formatShares(result.outAmountUi), name: ticker.name })
        : fill(t.trade.doneSell, { amount: formatShares(result.inAmountUi), name: ticker.name });
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-stretch gap-4 py-2 text-center">
        <p className="text-2xl text-fg">{t.trade.done}</p>
        <p className="text-sm text-balance text-fg-body">{summary}</p>
        {result.side === "sell" ? (
          <p className="text-sm text-fg-muted">{fill(t.trade.receiveSell, { amount: shownMoney(result.outAmountUi, displayCurrency, fxRate) })}</p>
        ) : null}
        <Button asChild size="lg" className="w-full">
          <Link href="/app/cartera">{t.trade.portfolio}</Link>
        </Button>
        {result.signature ? (
          <Button asChild variant="secondary" size="lg" className="w-full">
            <a href={explorerTxUrl(result.signature)} target="_blank" rel="noopener noreferrer">
              {t.trade.explorer}
              <span className="sr-only"> {t.trade.explorerNew}</span>
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        title={flowError ?? t.trade.orderFailed}
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={() => {
          setFlowError(null);
          setPhase("form");
          setRefreshKey((key) => key + 1);
        }}
      />
    );
  }

  const hint = blockCopy(t, block, side, amount, displayCurrency, fxRate, minUsd);
  const showDeposit = side === "buy" && block === "funds";
  const canReview = block === null && fresh && !quoting && !quoteError && !halted;
  const canConfirm = phase === "review" && canReview && remainingMs > 0 && pubkey !== null && !halted;
  const estimate = quote
    ? side === "buy"
      ? fill(t.trade.receiveBuy, { amount: formatShares(quote.outAmountUi), name: ticker.name })
      : fill(t.trade.receiveSell, { amount: shownMoney(quote.outAmountUi, displayCurrency, fxRate) })
    : null;
  const availableUsd = side === "buy" ? cashUsdc : (priceUsd && priceUsd > 0 ? shares * priceUsd : cashUsdc);
  const available =
    cap === null
      ? null
      : currency === "SHARES"
        ? fill(t.trade.holding, { amount: formatShares(cap) })
        : fill(t.trade.available, { amount: shownMoney(availableUsd, displayCurrency, fxRate) });
  const labels = { CLP: "CLP", USDC: "USD", SHARES: t.trade.shares, USD: "USD" } as const;

  if (phase === "review") {
    const sub = quote
      ? side === "buy"
        ? fill(t.trade.pay, {
            amount: shownMoney(quote.inAmountUi, displayCurrency, fxRate),
          })
        : fill(t.trade.sellOf, { amount: formatShares(quote.inAmountUi), name: ticker.name })
      : null;
    return (
      <div className="flex flex-col gap-5">
        <TradeMark ticker={ticker} />
        {fresh && quote && estimate ? (
          <div>
            <p className="text-center text-2xl text-balance text-fg" aria-live="polite">
              {estimate}
            </p>
            {sub ? <p className="mt-2 text-center text-sm text-fg-muted">{sub}</p> : null}
          </div>
        ) : null}
        {quoting || !fresh ? (
          <p role="status" className="text-center text-sm text-fg-muted">
            {quoteError ?? t.trade.quoting}
          </p>
        ) : (
          <p className="text-center text-sm text-fg-muted">{fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}</p>
        )}
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
        {halted ? <p className="text-center text-sm text-down">{t.detail.tradeHaltedNote}</p> : null}
        {fresh && quote ? <CostBreakdown rows={costRows(t, quote, side, displayCurrency, fxRate)} /> : null}
        {dollarsNote ? <p className="text-center text-xs text-fg-muted">{dollarsNote}</p> : null}
        <Link href="/legal/riesgos" className="text-sm font-medium text-fg underline underline-offset-4">
          {t.detail.risksLink}
        </Link>
        {pubkey ? null : <p className="text-center text-sm text-down">{t.trade.noWallet}</p>}
        <Button size="lg" className="w-full" disabled={!canConfirm} onClick={() => void confirm()}>
          {t.trade.confirm}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setPhase("form")}>
          {t.trade.back}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <TradeMark ticker={ticker} />
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
        describedBy={hint ? hintId : undefined}
        invalid={block === "min" || block === "funds"}
        chips={quickChips}
        onCurrencyChange={(next) => {
          if (next !== "CLP" && next !== "USDC" && next !== "SHARES") return;
          setAmountRaw(convertAmount(amount, currency, next, fxRate, priceUsd));
          setCurrency(next);
        }}
      />
      {available ? <p className="text-center text-sm text-fg-muted">{available}</p> : null}
      {side === "buy" ? <p className="text-center text-xs text-fg-muted">{minHelp}</p> : null}
      {halted ? (
        <p role="alert" className="text-center text-sm text-down">
          {t.detail.tradeHaltedNote}
        </p>
      ) : null}
      {block === "wait" ? (
        <p role="status" className="text-center text-sm text-fg-muted">
          {t.states.loading}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} role="alert" className="text-center text-sm text-down">
          {hint}
        </p>
      ) : null}
      {quoteError ? (
        <div role="alert" className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-down">{quoteError}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setRefreshKey((key) => key + 1);
            }}
          >
            {t.states.retry}
          </Button>
        </div>
      ) : null}
      {quoting ? (
        <p role="status" className="text-center text-sm text-fg-muted">
          {t.trade.quoting}
        </p>
      ) : null}
      {fresh && estimate && !quoteError ? (
        <p className="text-center text-sm text-balance text-fg-body" aria-live="polite">
          {estimate}
        </p>
      ) : null}
      {fresh && quote ? (
        <p className="text-center text-sm text-fg-muted">{fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}</p>
      ) : null}
      {dollarsNote ? <p className="text-center text-xs text-fg-muted">{dollarsNote}</p> : null}
      {block === "fx" || block === "price" ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            void (block === "fx" ? fx.refetch() : prices.refetch());
          }}
        >
          {t.states.retry}
        </Button>
      ) : null}
      {showDeposit ? (
        <Button asChild size="lg" className="w-full">
          <Link href={DEPOSIT_HREF}>{t.trade.deposit}</Link>
        </Button>
      ) : (
        <Button size="lg" className="w-full" disabled={!canReview} onClick={() => setPhase("review")}>
          {t.trade.review}
        </Button>
      )}
    </div>
  );
}

/** Sheet de compra o venta. Lo abre `?operar=comprar|vender` en el detalle. */
export function TradeSheet({
  open,
  side,
  ticker,
  onOpenChange,
}: {
  open: boolean;
  side: Side;
  ticker: Ticker;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const title = fill(side === "sell" ? t.detail.tradeSell : t.detail.tradeBuy, { name: ticker.name });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <TradeFlow key={`${side}:${ticker.symbol}`} side={side} ticker={ticker} />
    </Sheet>
  );
}
