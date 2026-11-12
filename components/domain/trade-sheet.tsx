"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { TradeImpactPreview } from "@/components/domain/trade-impact-preview";
import { MarketStatusPill } from "@/components/domain/market-status-pill";
import { RealAccountEmpty } from "@/components/domain/real-account-empty";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TradeExecutionStepper } from "@/components/domain/trade-execution-stepper";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { IconBack, IconCheck } from "@/components/ui/icons";
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
/** Vigencia nominal de una cotización en la UI; la barra se llena respecto a esto. */
const QUOTE_VALIDITY_MS = 15_000;

const BUY_CURRENCIES = ["USDC", "CLP", "SHARES"] as const satisfies readonly TradeAmountCurrency[];
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

/**
 * Filas del detalle. El total va aparte (`CostBreakdown.total`) para que la
 * última línea tenga el peso de un estado de cuenta.
 */
function quoteRows(t: Messages, quote: TradeQuote, currency: Currency, rate: number | null | undefined) {
  const fee =
    quote.costs.platformFeeBps === 0
      ? t.trade.feeFree
      : fill(t.trade.feeLine, {
          percent: plainPercent.format(quote.costs.platformFeeBps / 10_000),
          amount: shownMoney(quote.costs.platformFeeUsd, currency, rate),
        });
  const rows = [
    { label: t.trade.price, value: shownMoney(quote.pricePerShareUsd, currency, rate) },
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
    <div className="flex min-w-0 items-center gap-3">
      <TickerLogo symbol={ticker.symbol} name={ticker.name} logoUrl={ticker.logo} size={40} decorative loading="eager" sizes="48px" />
      <div className="min-w-0">
        <p className="truncate text-[15px] leading-5 font-medium text-fg">{ticker.name}</p>
        <p className="num mt-0.5 truncate text-[11px] uppercase tracking-[0.045em] text-fg-subtle">{ticker.symbol}</p>
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

/** Fila de documento: rótulo a la izquierda, cifra mono alineada a la derecha. */
function StatementRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
      <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd className={cn("num text-right text-sm leading-5 text-fg", strong && "font-medium")}>{value}</dd>
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

/**
 * Barra del botón principal. Queda pegada al borde inferior del sheet a todo el
 * ancho (`sticky`), con el botón de 48 px. El espacio del área segura del iPhone
 * lo aporta el panel del `Sheet` (paddingBottom con `env(safe-area-inset-bottom)`),
 * así que aquí no se duplica.
 */
function SheetActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-border bg-bg/95 px-5 pt-4 pb-2 backdrop-blur-md md:-mx-7 md:px-7">
      {children}
    </div>
  );
}

function TradeFlow({ side, ticker }: { side: Side; ticker: Ticker }) {
  const { t, currency: displayCurrency, language } = useT();
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

  const isEnglish = language === "en";
  const doc = isEnglish
    ? { folio: "Order ID", date: "Date", receive: "You receive", deliver: "You deliver", paid: "Total paid", received: "Total received" }
    : { folio: "Folio", date: "Fecha", receive: "Recibes", deliver: "Entregas", paid: "Total pagado", received: "Total recibido" };
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
      <div className="flex flex-1 flex-col">
        <TradeExecutionStepper
          phase={phase}
          signingLabel={t.trade.signing}
          submittingLabel={t.trade.submitting}
        />
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
      <div role="status" aria-live="polite" className="flex flex-1 flex-col gap-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-fg text-fg"
          >
            <IconCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xl leading-tight text-fg">{t.trade.done}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-body">{summary}</p>
          </div>
        </div>

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

        <p className="text-[11px] leading-relaxed text-fg-subtle">Enrutamiento Jupiter Spot → Solana SPL.</p>

        <SheetActionBar>
          <div className="flex flex-col gap-2">
            <Button asChild size="lg" className="min-h-12 w-full text-base">
              <Link href="/app/cartera">{t.trade.portfolio}</Link>
            </Button>
            {result.signature ? (
              <a
                href={explorerTxUrl(result.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
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
      <div role="alert" className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col items-start gap-3 pt-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-down/25 bg-down-bg px-2.5 py-1 text-[11px] font-medium text-down">
            <span className="size-1.5 rounded-full bg-down" aria-hidden="true" />
            {t.states.error}
          </span>
          <p className="text-xl leading-snug text-balance text-fg">{flowError ?? t.trade.orderFailed}</p>
        </div>
        <SheetActionBar>
          <Button
            size="lg"
            className="min-h-12 w-full text-base"
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

  const hint = blockCopy(t, block, side, amount, displayCurrency, fxRate, minUsd);
  const showDeposit = side === "buy" && block === "funds";
  const canReview = block === null && fresh && !quoting && !quoteError && !halted;
  const canConfirm = phase === "review" && canReview && remainingMs > 0 && pubkey !== null && !halted;
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
        : priceUsd && priceUsd > 0
          ? shownMoney(shares * priceUsd, displayCurrency, fxRate)
          : null;
  const availableLabel = templateLabel(
    side === "sell" && currency === "SHARES" ? t.trade.holding : t.trade.available,
  );
  const labels = { CLP: "CLP", USDC: "USD", SHARES: t.trade.shares, USD: "USD" } as const;

  if (phase === "review") {
    const sub = quote
      ? side === "buy"
        ? fill(t.trade.pay, { amount: shownMoney(quote.inAmountUi, displayCurrency, fxRate) })
        : fill(t.trade.sellOf, { amount: formatShares(quote.inAmountUi), name: ticker.name })
      : null;
    const rows = quote && fresh ? quoteRows(t, quote, displayCurrency, fxRate) : null;
    const total =
      quote && fresh
        ? side === "buy"
          ? {
              label: isEnglish ? "Estimated total" : "Total estimado",
              value: shownMoney(quote.inAmountUi, displayCurrency, fxRate),
            }
          : { label: "Total", value: shownMoney(quote.outAmountUi, displayCurrency, fxRate) }
        : undefined;

    return (
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPhase("form")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <IconBack className="size-4" aria-hidden="true" />
            {t.trade.back}
          </button>
          <span className="num text-[11px] uppercase tracking-[0.045em] text-fg-subtle">{ticker.symbol}</span>
        </div>

        {quote && fresh ? (
          <div className="border-y border-border py-5">
            <p className="label">{t.trade.youReceive}</p>
            {side === "buy" ? (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-[2rem] leading-none text-fg">{formatShares(quote.outAmountUi)}</span>
                <span className="text-[13px] font-medium text-fg-muted">{ticker.symbol}</span>
              </p>
            ) : (
              <p className="num mt-2 text-[2rem] leading-none text-fg">
                {shownMoney(quote.outAmountUi, displayCurrency, fxRate)}
              </p>
            )}
            {sub ? <p className="mt-3 text-[13px] leading-relaxed text-fg-body">{sub}</p> : null}
          </div>
        ) : (
          <div role="status" className="border-y border-border py-5">
            <p className="label">{t.trade.youReceive}</p>
            <p className="mt-3 text-sm text-fg-muted">{quoteError ?? t.trade.quoting}</p>
            {quoteError ? (
              <button
                type="button"
                onClick={() => setRefreshKey((key) => key + 1)}
                className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4"
              >
                {t.states.retry}
              </button>
            ) : null}
          </div>
        )}

        {quote && fresh ? (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-fg-muted">
              {fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}
            </span>
            <QuoteValidityBar remainingMs={remainingMs} language={language} />
            {remainingMs <= 0 ? (
              <span className="text-[12px] leading-relaxed text-down">{t.trade.errors.QUOTE_EXPIRED}</span>
            ) : null}
          </div>
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
        {halted ? <p className="text-sm leading-relaxed text-down">{t.detail.tradeHaltedNote}</p> : null}

        {rows ? <CostBreakdown rows={rows} total={total} /> : null}

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

        {dollarsNote ? <p className="text-[11px] leading-relaxed text-fg-subtle">{dollarsNote}</p> : null}

        {/* M83: aviso antes de confirmar. Texto borrador hasta la revisión
            del abogado; si la exige, cambia en un solo lugar. */}
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          El precio puede variar. Operación ejecutada en Solana vía Jupiter. No es asesoría.{" "}
          <span className="font-medium text-warn">[REVISIÓN ABOGADO]</span>
        </p>

        <Link
          href="/legal/riesgos"
          className="inline-flex min-h-11 w-fit items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4 outline-none transition-colors hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
        >
          {t.detail.risksLink}
        </Link>

        {pubkey ? null : <p className="text-sm leading-relaxed text-down">{t.trade.noWallet}</p>}

        <SheetActionBar>
          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-base"
            disabled={!canConfirm}
            onClick={() => void confirm()}
          >
            {t.trade.confirm}
          </Button>
        </SheetActionBar>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <TradeMark ticker={ticker} />
        <div className="shrink-0 text-right">
          <p className="label-xs">{t.trade.price}</p>
          <p className="num mt-1 text-sm text-fg">{priceUsd ? shownMoney(priceUsd, displayCurrency, fxRate) : "—"}</p>
        </div>
      </div>

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
        chipsClassName="no-scrollbar flex-nowrap justify-start overflow-x-auto pb-1 sm:flex-wrap sm:justify-start sm:pb-0"
        onCurrencyChange={(next) => {
          if (next !== "CLP" && next !== "USDC" && next !== "SHARES") return;
          setAmountRaw(convertAmount(amount, currency, next, fxRate, priceUsd));
          setCurrency(next);
        }}
      />

      {side === "sell" && shares > 0 ? (
        <div className="no-scrollbar -mt-1 flex flex-nowrap items-center gap-2 overflow-x-auto">
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
                    : currency === "CLP" && priceUsd && fxRate
                      ? Math.floor(shares * priceUsd * fxRate * preset.pct)
                      : priceUsd
                        ? Number((shares * priceUsd * preset.pct).toFixed(2))
                        : shares * preset.pct;
                setAmountRaw(String(Number(base.toFixed(6))));
              }}
              className="inline-flex min-h-10 shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-full border border-border-control/40 px-3 text-xs font-medium tabular-nums text-fg-body transition-colors duration-150 hover:border-border-control hover:bg-surface-1 hover:text-fg active:scale-[0.98]"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {fresh && quote && estimate ? (
          <p className="text-sm leading-relaxed text-fg-muted" aria-live="polite">
            <AmountSentence
              template={side === "buy" ? t.trade.receiveBuy : t.trade.receiveSell}
              amount={
                side === "buy"
                  ? formatShares(quote.outAmountUi)
                  : shownMoney(quote.outAmountUi, displayCurrency, fxRate)
              }
              name={ticker.name}
            />
          </p>
        ) : quoting ? (
          <p role="status" className="text-sm leading-relaxed text-fg-muted">
            {t.trade.quoting}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-fg-subtle">—</p>
        )}

        <div className="flex items-baseline justify-between gap-4 border-t border-border/70 pt-3">
          <span className="text-[12px] text-fg-muted">{availableLabel}</span>
          <span className="num text-[13px] font-medium text-fg">{availableValue ?? "—"}</span>
        </div>

        {side === "buy" ? <p className="text-[11px] leading-relaxed text-fg-subtle">{minHelp}</p> : null}
      </div>

      {fresh && quote ? (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-fg-muted">
            {fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}
          </span>
          <QuoteValidityBar remainingMs={remainingMs} language={language} />
        </div>
      ) : null}

      {dollarsNote ? <p className="text-[11px] leading-relaxed text-fg-subtle">{dollarsNote}</p> : null}

      {halted ? (
        <p role="alert" className="w-full max-w-full text-[13px] leading-relaxed break-words text-balance text-down">
          {t.detail.tradeHaltedNote}
        </p>
      ) : null}
      {block === "wait" ? (
        <p role="status" className="text-[13px] leading-relaxed text-fg-muted">
          {t.states.loading}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} role="alert" className="w-full max-w-full text-[13px] leading-relaxed break-words text-balance text-down">
          {hint}
        </p>
      ) : null}
      {quoteError ? (
        <div role="alert" className="flex flex-col items-start gap-1">
          <p className="w-full max-w-full text-[13px] leading-relaxed break-words text-balance text-down">{quoteError}</p>
          <button
            type="button"
            onClick={() => {
              setRefreshKey((key) => key + 1);
            }}
            className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            {t.states.retry}
          </button>
        </div>
      ) : null}
      {block === "fx" || block === "price" ? (
        <button
          type="button"
          onClick={() => {
            void (block === "fx" ? fx.refetch() : prices.refetch());
          }}
          className="inline-flex min-h-11 w-fit items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
        >
          {t.states.retry}
        </button>
      ) : null}

      <SheetActionBar>
        {showDeposit ? (
          <Button asChild size="lg" className="min-h-12 w-full touch-manipulation text-base">
            <Link href={DEPOSIT_HREF}>{t.trade.deposit}</Link>
          </Button>
        ) : (
          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-base"
            disabled={!canReview}
            onClick={() => setPhase("review")}
          >
            {t.trade.review}
          </Button>
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
}: {
  open: boolean;
  side: Side;
  ticker: Ticker;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const title = fill(side === "sell" ? t.detail.tradeSell : t.detail.tradeBuy, { name: ticker.name });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} fill>
      <TradeFlow key={`${side}:${ticker.symbol}`} side={side} ticker={ticker} />
    </Sheet>
  );
}
