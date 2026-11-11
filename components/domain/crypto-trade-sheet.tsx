"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";

import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";
import { MAX_ORDER_USD, MIN_TRADE_USD, QUOTE_DEBOUNCE_MS } from "@/config/trade";
import {
  CRYPTO_REAL_BLOCK_MESSAGE,
  LST_YIELD_NOTICE,
  NON_CUSTODY_LINE,
  USDY_YIELD_NOTICE,
} from "@/content/crypto-legal";
import { ApiError, buildTrade, getTradeStatus, quoteTrade, submitTrade } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { signDemoTransaction } from "@/lib/auth/sign-transaction";
import { findCryptoBySymbol } from "@/lib/catalog/crypto";
import { findEarnBySymbol } from "@/lib/catalog/lst";
import { formatMoney } from "@/lib/format";
import { SPOT_MS, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { parseAmount } from "@/lib/trade/amount";
import type { Order, Side, TradeQuote } from "@/lib/types";

/** Vigencia nominal de una cotización en la UI (la del servidor manda). */
const QUOTE_VALIDITY_MS = 15_000;
const POLL_MS = 1_000;
const POLL_BUDGET_MS = 20_000;

type Phase = "form" | "review" | "signing" | "submitting" | "done" | "error";

type LiveQuote = {
  key: string;
  quote: TradeQuote | null;
  error: string | null;
  pending: boolean;
};

const idleQuote: LiveQuote = { key: "", quote: null, error: null, pending: false };

/** Motivo por el que todavía no se puede cotizar. `null` = listo para cotizar. */
type Block = "wait" | "empty" | "min" | "cap" | "funds" | "price" | null;

const tokenFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 6 });
const percentFormatter = new Intl.NumberFormat("es-CL", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "never",
});
const priceFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

/** Precio unitario legible: 2 decimales para valores ≥ 1 y hasta 8 para los muy chicos. */
function formatPrice(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1) return formatMoney(value, "USD");
  return `US$ ${priceFormatter.format(value)}`;
}

function tokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return tokenFormatter.format(value);
}

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

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Mensaje de error de una operación. La API devuelve textos de dominio ya en
 * español (por ejemplo el bloqueo de dinero real o la falta de precio), así que
 * se prefieren; `fallback` sólo cubre fallos sin mensaje útil.
 */
function failureMessage(error: unknown, fallback: string): string | null {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof ApiError) {
    const message = error.message.trim();
    return message.length > 0 ? message : fallback;
  }
  if (error instanceof Error && error.message === "NO_WALLET") return "Falta la billetera para firmar.";
  return fallback;
}

async function pollOrder(id: string, mockError: string | null, isCurrent: () => boolean): Promise<Order> {
  const started = Date.now();
  for (;;) {
    if (!isCurrent()) throw new DOMException("Aborted", "AbortError");
    const order = await getTradeStatus(id, mockError);
    if (!isCurrent()) throw new DOMException("Aborted", "AbortError");
    if (order.status === "confirmed" || order.status === "failed" || order.status === "expired") return order;
    if (Date.now() - started > POLL_BUDGET_MS) {
      throw new ApiError("UPSTREAM", "La orden no confirmó a tiempo.");
    }
    await sleep(POLL_MS);
  }
}

function monogram(value: string): string {
  const letters = value.replace(/[^A-Za-z0-9]/g, "");
  return (letters.slice(0, 3) || "?").toUpperCase();
}

/** Barra del botón principal pegada al borde inferior del sheet (botón de 48 px). */
function SheetActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-border/60 bg-bg/95 px-5 pt-3 pb-2 backdrop-blur-md">
      {children}
    </div>
  );
}

function QuoteValidityBar({ remainingMs }: { remainingMs: number }) {
  const pct = Math.max(0, Math.min(100, (remainingMs / QUOTE_VALIDITY_MS) * 100));
  const tone = pct < 15 ? "bg-down" : pct < 30 ? "bg-warn" : "bg-brand";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="Validez de la cotización"
      className="mx-auto h-1 w-full max-w-56 overflow-hidden rounded-full bg-surface-3"
    >
      <div
        className={`${tone} h-full rounded-full transition-[width,background-color] duration-1000 ease-linear motion-reduce:transition-none`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CryptoFlow({
  symbol,
  mode,
  maxOrderUsd,
  onClose,
  onDone,
}: {
  symbol: string;
  mode: Side;
  maxOrderUsd: number | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useT();
  const session = useSession();
  const queryClient = useQueryClient();
  const portfolio = usePortfolio();
  const prices = usePrices([symbol], true, SPOT_MS);
  const hintId = useId();
  const [amountRaw, setAmountRaw] = useState("");
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

  const crypto = findCryptoBySymbol(symbol);
  const lst = crypto ? null : findEarnBySymbol(symbol);
  const name = crypto?.name ?? lst?.name ?? symbol;
  const isLst = crypto === null && lst !== null;
  const isUsdy = (crypto?.symbol ?? lst?.symbol ?? symbol) === "USDY";
  // Tope efectivo: el del token (AMARILLO) o el global de la beta. Nunca más de MAX_ORDER_USD.
  const cap = Math.max(
    MIN_TRADE_USD,
    Math.min(maxOrderUsd ?? crypto?.maxOrderUsd ?? MAX_ORDER_USD, MAX_ORDER_USD),
  );

  const wallet = session.user?.walletAddress?.trim() ?? "";
  const userId = session.user?.id?.trim() ?? "";
  // La cuenta demo no tiene billetera: se firma con el id de usuario (uuid ≥ 32).
  const pubkey = wallet.length >= 32 ? wallet : userId.length >= 32 ? userId : null;

  const held = portfolio.data?.positions.find((item) => item.symbol === symbol)?.shares ?? 0;
  const cash = portfolio.data?.cashUsdc ?? 0;
  const priceUsd =
    prices.data?.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase())?.priceUsd ?? null;
  const shownPrice = formatPrice(priceUsd);

  const amount = parseAmount(amountRaw);
  const quoteCurrency: "USDC" | "SHARES" = mode === "buy" ? "USDC" : "SHARES";
  const quoteAmount = amount;

  let block: Block = null;
  if (portfolio.isPending || prices.isPending) block = "wait";
  else if (!(amount > 0)) block = "empty";
  else if (mode === "buy" && !(priceUsd && priceUsd > 0)) block = "price";
  else if (mode === "buy") {
    if (amount + 1e-9 < MIN_TRADE_USD) block = "min";
    else if (amount > cap + 1e-9) block = "cap";
    else if (amount > cash + 1e-9) block = "funds";
  } else if (amount > held + 1e-9) {
    block = "funds";
  } else if (priceUsd !== null && priceUsd > 0 && amount * priceUsd + 1e-9 < MIN_TRADE_USD) {
    block = "min";
  }

  const requestKey =
    block === null
      ? `${mode}|${symbol}|${quoteCurrency}|${quoteAmount}|${refreshKey}|${mockError ?? ""}`
      : "";
  const live = quoteState.key === requestKey ? quoteState : idleQuote;
  const quote = live.quote;
  const quoting = live.pending;
  const quoteError = live.error;
  const fresh = quote !== null && !quoting && quoteError === null;
  const remainingMs = quote ? Date.parse(quote.expiresAt) - now : 0;
  const busy = phase === "signing" || phase === "submitting" || phase === "done" || phase === "error";

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
          side: mode,
          symbol,
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
            error: failureMessage(error, t.trade.errors.UPSTREAM) ?? t.trade.errors.UPSTREAM,
            pending: false,
          });
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
      seqRef.current += 1;
    };
  }, [busy, mockError, mode, pubkey, quoteAmount, quoteCurrency, requestKey, symbol, t]);

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
      const signed = await signDemoTransaction(built.transactionBase64);
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
        setFlowError(order.error?.trim() || t.trade.orderFailed);
        setPhase("error");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      setResult(order);
      setPhase("done");
      onDone?.();
    } catch (error) {
      if (!mounted.current) return;
      const message = failureMessage(error, t.trade.orderFailed);
      if (!message) return;
      setFlowError(message);
      setPhase("error");
    } finally {
      confirming.current = false;
    }
  }

  if (portfolio.isPending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    );
  }

  if (portfolio.isError) {
    return (
      <ErrorState
        title="No pudimos cargar tu saldo demo."
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={() => {
          void portfolio.refetch();
        }}
      />
    );
  }

  if (phase === "signing" || phase === "submitting") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="size-6 animate-spin rounded-full border-2 border-border-strong border-t-fg" aria-hidden />
        <p className="text-sm text-fg-body">{phase === "signing" ? t.trade.signing : t.trade.submitting}</p>
      </div>
    );
  }

  if (phase === "done" && result) {
    const received =
      result.side === "buy" ? `${tokenAmount(result.outAmountUi)} ${symbol}` : formatMoney(result.outAmountUi, "USD");
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-stretch gap-4 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft/80 px-3.5 py-1 text-xs font-semibold text-brand">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span>OK</span>
        </div>
        <p className="text-2xl text-fg">{t.trade.done}</p>
        <p className="text-sm text-balance text-fg-body">
          {result.side === "buy"
            ? `Compraste ${received} de ${name}.`
            : `Vendiste ${tokenAmount(result.inAmountUi)} ${symbol} y recibiste ${received}.`}
        </p>
        <p className="text-xs leading-relaxed text-fg-muted">
          Asiento en la demo: el saldo y las posiciones son ficticios.
        </p>
        <Button asChild size="lg" className="min-h-12 w-full">
          <Link href="/app/cartera">Ver en cartera</Link>
        </Button>
        {result.signature ? (
          <Button asChild variant="secondary" size="lg" className="min-h-12 w-full">
            <a href={explorerTxUrl(result.signature)} target="_blank" rel="noopener noreferrer">
              {t.trade.explorer}
            </a>
          </Button>
        ) : null}
        <Button variant="ghost" size="lg" className="min-h-12 w-full" onClick={onClose}>
          Cerrar
        </Button>
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

  const hint =
    block === "min"
      ? fill(t.trade.min, { amount: formatMoney(MIN_TRADE_USD, "USD") })
      : block === "cap"
        ? `El tope por orden de ${symbol} es ${formatMoney(cap, "USD")}. Prueba con un monto menor.`
        : block === "funds"
          ? mode === "buy"
            ? t.trade.insufficient
            : `No tienes ${symbol} suficiente para esta venta.`
          : block === "price"
            ? t.trade.noPrice
            : null;

  const estimate = quote
    ? mode === "buy"
      ? `Recibes ≈ ${tokenAmount(quote.outAmountUi)} ${symbol}`
      : `Recibes ≈ ${formatMoney(quote.outAmountUi, "USD")}`
    : null;

  const canReview = block === null && fresh && !quoting && !quoteError;
  const canConfirm = phase === "review" && canReview && remainingMs > 0 && pubkey !== null;
  const maxAmount = mode === "buy" ? (cash > 0 ? Math.min(cash, cap) : undefined) : held;

  const header = (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-surface-2 text-xs font-semibold tracking-tight text-fg-body"
      >
        {monogram(symbol)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-fg">{name}</p>
        <p className="truncate text-sm text-fg-muted">
          {symbol} <span aria-hidden>·</span> Solana
        </p>
      </div>
    </div>
  );

  if (phase === "review") {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        {header}
        {fresh && quote && estimate ? (
          <div>
            <p className="text-center text-2xl text-balance text-fg" aria-live="polite">
              {estimate}
            </p>
            <p className="mt-2 text-center text-sm text-fg-muted">
              {mode === "buy"
                ? `Pagas ${formatMoney(quote.inAmountUi, "USD")}`
                : `Vendes ${tokenAmount(quote.inAmountUi)} ${symbol}`}
            </p>
          </div>
        ) : null}
        {quoting || !fresh ? (
          <p role="status" className="text-center text-sm text-fg-muted">
            {quoteError ?? t.trade.quoting}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-sm text-fg-muted">
              {fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}
            </p>
            <QuoteValidityBar remainingMs={remainingMs} />
          </div>
        )}
        {fresh && quote ? (
          <div className="rounded-2xl border border-white/65 bg-surface-1/75 p-3.5 tabular-nums">
            <CostBreakdown
              rows={[
                { label: "Precio por " + symbol, value: formatPrice(quote.pricePerShareUsd) ?? "sin dato" },
                {
                  label: t.trade.youReceive,
                  value:
                    mode === "buy"
                      ? `${tokenAmount(quote.outAmountUi)} ${symbol}`
                      : formatMoney(quote.outAmountUi, "USD"),
                },
                {
                  label: fill(t.trade.fee, { brand: site.name }),
                  value:
                    quote.costs.platformFeeBps === 0
                      ? t.trade.feeFree
                      : fill(t.trade.feeLine, {
                          percent: percentFormatter.format(quote.costs.platformFeeBps / 10_000),
                          amount: formatMoney(quote.costs.platformFeeUsd, "USD"),
                        }),
                },
                { label: t.trade.network, value: `${tokenFormatter.format(quote.costs.networkFeeSol)} SOL` },
                { label: t.trade.impact, value: percentFormatter.format(quote.costs.priceImpactPct) },
                { label: t.trade.slippage, value: percentFormatter.format(quote.costs.slippageBps / 10_000) },
              ]}
            />
          </div>
        ) : null}
        <p className="text-center text-xs leading-relaxed text-fg-muted">
          {quote?.route === "mock"
            ? "Cotización de referencia en la demo; el asiento es ficticio."
            : "Cotización real de Jupiter en Solana y asiento en la demo."}{" "}
          El precio puede variar y la cotización vence. No es asesoría de inversión.
        </p>
        {pubkey ? null : <p className="text-center text-sm text-down">{t.trade.noWallet}</p>}
        <Button variant="ghost" size="lg" className="min-h-12 w-full touch-manipulation" onClick={() => setPhase("form")}>
          {t.trade.back}
        </Button>
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
    <div className="flex w-full min-w-0 flex-col gap-5">
      {header}
      <AmountInput
        id={`${hintId}-amount`}
        label={mode === "buy" ? "Monto en dólares" : `Cantidad de ${symbol}`}
        value={amountRaw}
        onChange={setAmountRaw}
        currency={quoteCurrency}
        currencies={[quoteCurrency]}
        labels={{ USDC: "USD", SHARES: symbol }}
        suffix={mode === "sell" ? symbol : undefined}
        maxLabel={t.trade.max}
        max={maxAmount}
        describedBy={hint ? hintId : undefined}
        invalid={block === "min" || block === "cap" || block === "funds"}
        inputClassName="min-h-14 py-2"
        chipClassName="min-h-12 shrink-0 px-4 text-base whitespace-nowrap"
        chipsClassName="flex-nowrap justify-start overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:pb-0"
      />
      <div className="flex flex-col items-center gap-1 text-center text-sm">
        <p className="text-fg-body">
          {shownPrice ? (
            <>
              Precio <span className="num font-medium text-fg">{shownPrice}</span> por {symbol}
            </>
          ) : prices.isPending ? (
            "Cargando el precio…"
          ) : (
            <span className="text-down">
              {mode === "buy" ? "Sin precio ahora: la compra está deshabilitada." : "Sin precio ahora."}
            </span>
          )}
        </p>
        <p className="text-xs text-fg-muted">
          {mode === "buy"
            ? `Mínimo ${formatMoney(MIN_TRADE_USD, "USD")} · Tope por orden ${formatMoney(cap, "USD")}`
            : `Mínimo ${formatMoney(MIN_TRADE_USD, "USD")}`}
        </p>
        <p className="text-xs text-fg-muted">
          {mode === "buy"
            ? `Disponible en la demo: ${formatMoney(cash, "USD")}`
            : `Tienes ${tokenAmount(held)} ${symbol}`}
        </p>
      </div>
      {hint ? (
        <p id={hintId} role="alert" className="w-full max-w-full text-center text-sm leading-relaxed break-words text-balance text-down">
          {hint}
        </p>
      ) : null}
      {block === "price" ? (
        <Button
          variant="secondary"
          size="lg"
          className="min-h-11 w-full"
          onClick={() => {
            void prices.refetch();
          }}
        >
          {t.states.retry}
        </Button>
      ) : null}
      {quoteError ? (
        <div role="alert" className="flex w-full max-w-full flex-col items-center gap-3 text-center">
          <p className="w-full max-w-full text-sm leading-relaxed break-words text-balance text-down">{quoteError}</p>
          <Button
            variant="secondary"
            size="lg"
            className="min-h-11"
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
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-sm text-fg-muted">
            {fill(t.trade.expiresIn, { time: countdownLabel(remainingMs) })}
          </p>
          <QuoteValidityBar remainingMs={remainingMs} />
        </div>
      ) : null}
      {isLst ? <p className="text-xs leading-relaxed text-fg-body">{LST_YIELD_NOTICE}</p> : null}
      {isUsdy ? <p className="text-xs leading-relaxed text-fg-body">{USDY_YIELD_NOTICE}</p> : null}
      <p className="text-xs leading-relaxed text-fg-body">{NON_CUSTODY_LINE}</p>
      <SheetActionBar>
        <Button
          size="lg"
          className="min-h-12 w-full touch-manipulation text-base"
          disabled={!canReview}
          onClick={() => setPhase("review")}
        >
          {t.trade.review}
        </Button>
      </SheetActionBar>
    </div>
  );
}

/**
 * Hoja de compra/venta de una cripto o un LST (sólo demo). U3 la monta desde
 * Ganar; la ficha la usa para comprar. El asiento lo hace la demo.
 */
export function CryptoTradeSheet({
  symbol,
  open,
  onClose,
  mode = "buy",
  maxOrderUsd = null,
  onDone,
}: {
  symbol: string;
  open: boolean;
  onClose: () => void;
  mode?: "buy" | "sell";
  maxOrderUsd?: number | null;
  onDone?: () => void;
}): ReactElement | null {
  const asset = findCryptoBySymbol(symbol) ?? findEarnBySymbol(symbol);
  const name = asset?.name ?? symbol;
  if (!open) return null;
  const title = mode === "buy" ? `Comprar ${name}` : `Vender ${name}`;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
    >
      <CryptoFlow
        key={`${symbol}:${mode}`}
        symbol={symbol}
        mode={mode}
        maxOrderUsd={maxOrderUsd}
        onClose={onClose}
        onDone={onDone}
      />
    </Sheet>
  );
}

/**
 * Bloque de precio y botones de la ficha. Es cliente porque el precio es vivo y
 * la hoja de compra necesita estado; el resto de la ficha va en el servidor.
 */
export function CryptoBuyPanel({
  symbol,
  name,
  maxOrderUsd = null,
  accountMode = "demo",
}: {
  symbol: string;
  name: string;
  maxOrderUsd?: number | null;
  accountMode?: "demo" | "real";
}): ReactElement {
  const prices = usePrices([symbol], true, SPOT_MS);
  const portfolio = usePortfolio();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Side>("buy");

  const crypto = findCryptoBySymbol(symbol);
  const cap = Math.max(
    MIN_TRADE_USD,
    Math.min(maxOrderUsd ?? crypto?.maxOrderUsd ?? MAX_ORDER_USD, MAX_ORDER_USD),
  );
  const priceUsd =
    prices.data?.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase())?.priceUsd ?? null;
  const shownPrice = formatPrice(priceUsd);
  const cash = portfolio.data?.cashUsdc ?? null;
  const held = portfolio.data?.positions.find((item) => item.symbol === symbol)?.shares ?? 0;
  const real = accountMode === "real";

  return (
    <section
      aria-labelledby={`${symbol}-precio`}
      className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-surface-1 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${symbol}-precio`} className="text-xs font-medium tracking-wide text-fg-muted uppercase">
          Precio de {name} ({symbol})
        </h2>
        <p className="num font-mono text-4xl tracking-tight text-fg tabular-nums">
          {shownPrice ?? (prices.isPending ? "Cargando…" : "Sin precio")}
        </p>
        {shownPrice ? null : (
          <p className="text-xs leading-relaxed text-fg-body">
            {prices.isPending
              ? "Consultando el precio en Solana."
              : "No pudimos obtener el precio ahora. Sin precio no se puede comprar; no usamos un precio de referencia inventado."}
          </p>
        )}
        {!shownPrice && !prices.isPending ? (
          <div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-1"
              onClick={() => {
                void prices.refetch();
              }}
            >
              Reintentar precio
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-fg-muted">
        Mínimo {formatMoney(MIN_TRADE_USD, "USD")} · Tope por orden {formatMoney(cap, "USD")}
        {cash !== null ? ` · Disponible en la demo ${formatMoney(cash, "USD")}` : ""}
      </p>

      {real ? (
        <p role="alert" className="rounded-2xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm leading-relaxed text-fg-body">
          {CRYPTO_REAL_BLOCK_MESSAGE}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-base"
            onClick={() => {
              setMode("buy");
              setOpen(true);
            }}
          >
            Comprar {symbol}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="min-h-12 w-full touch-manipulation text-base"
            disabled={!(held > 0)}
            title={held > 0 ? undefined : `No tienes ${symbol} para vender`}
            onClick={() => {
              setMode("sell");
              setOpen(true);
            }}
          >
            Vender {symbol}
          </Button>
        </div>
      )}

      <p className="text-xs leading-relaxed text-fg-body">{NON_CUSTODY_LINE}</p>

      <CryptoTradeSheet
        symbol={symbol}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        mode={mode}
        maxOrderUsd={cap}
      />
    </section>
  );
}
