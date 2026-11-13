"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconBack, IconCheck } from "@/components/ui/icons";
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
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import { SPOT_MS, usePortfolio, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { parseAmount } from "@/lib/trade/amount";
import type { Order, Side, TradeQuote } from "@/lib/types";

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

type StatusAction = { label: string; onClick: () => void } | null;

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

/** Fila de estado de cuenta: rótulo a la izquierda, cifra tabular a la derecha. */
function StatementRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-6 py-3">
      <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">{label}</dt>
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

/** CTA primaria: el verbo a la izquierda y el monto dentro del botón. */
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
          <span className="num text-[13px] font-medium text-white/75">{amount}</span>
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Pie del paso: una línea de estado con alto fijo (44 px) y el CTA debajo. El
 * motivo del bloqueo va en esa misma línea, así el botón no se mueve cuando
 * cambia el estado. `announce` se apaga en la cuenta regresiva para no repetir
 * el aviso cada segundo.
 */
function SheetActionBar({
  status,
  statusId,
  tone = "muted",
  action = null,
  announce = true,
  children,
}: {
  status: string;
  statusId?: string;
  tone?: "muted" | "down";
  action?: StatusAction;
  announce?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-border bg-bg px-5 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:-mx-7 md:px-7 md:pb-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p
          id={statusId}
          role="status"
          aria-live={announce ? "polite" : "off"}
          className={cn(
            "line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px]",
            tone === "down" ? "text-down" : "text-fg-muted",
          )}
        >
          {status}
        </p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      {children}
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
  const statusId = useId();
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

  const header = (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[13px] font-semibold tracking-[0.02em] text-fg-body"
        >
          {monogram(symbol)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-5 font-medium text-fg">{name}</p>
          <p className="num mt-0.5 truncate text-[13px] leading-4 tracking-[0.01em] text-fg-muted">
            {symbol} <span aria-hidden>·</span> Solana
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] leading-4 text-fg-muted">Precio</p>
        <p className="num mt-1 text-[13px] leading-4 text-fg">
          {shownPrice ?? (prices.isPending ? "—" : "Sin precio")}
        </p>
      </div>
    </div>
  );

  if (portfolio.isPending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">{t.states.loading}</span>
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-12 w-44" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    );
  }

  if (portfolio.isError) {
    return (
      <div className="flex min-h-full flex-col">
        <div role="alert" className="flex flex-1 flex-col gap-3 pt-1 pb-8">
          <p className="text-[13px] leading-5 text-down">Error</p>
          <p className="text-xl leading-snug text-balance text-fg">No pudimos cargar tu saldo demo.</p>
        </div>
        <SheetActionBar status="Revisa tu conexión e inténtalo de nuevo." tone="down">
          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-[15px] md:text-base"
            onClick={() => {
              void portfolio.refetch();
            }}
          >
            {t.states.retry}
          </Button>
        </SheetActionBar>
      </div>
    );
  }

  if (phase === "signing" || phase === "submitting") {
    const signing = phase === "signing";
    return (
      <div className="flex min-h-full flex-col gap-6">
        {header}
        <div role="status" aria-live="polite" className="flex flex-1 flex-col items-start justify-center gap-3 py-12">
          <span
            aria-hidden
            className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-fg motion-reduce:animate-none"
          />
          <p className="text-xl leading-tight text-fg">{signing ? t.trade.signing : t.trade.submitting}</p>
          <p className="max-w-xs text-[13px] leading-relaxed text-fg-muted">
            {signing
              ? "Preparamos la transacción para tu firma. No cierres esta hoja."
              : "Confirmando la orden en Solana. No cierres esta hoja."}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    const received =
      result.side === "buy"
        ? `${tokenAmount(result.outAmountUi)} ${symbol}`
        : formatMoney(result.outAmountUi, "USD");
    const summary =
      result.side === "buy"
        ? `Compraste ${received} de ${name}.`
        : `Vendiste ${tokenAmount(result.inAmountUi)} ${symbol} y recibiste ${received}.`;
    const totalLabel = result.side === "buy" ? "Total pagado" : "Total recibido";
    const totalValue = formatMoney(result.side === "buy" ? result.inAmountUi : result.outAmountUi, "USD");

    return (
      <div className="flex min-h-full flex-col">
        <div className="flex flex-col gap-6 pb-8">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-fg text-bg"
            >
              <IconCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xl leading-tight text-fg">{t.trade.done}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-body">{summary}</p>
            </div>
          </div>

          <dl className="divide-y divide-border border-y border-border">
            <StatementRow label="Folio" value={`#MV-${result.id.slice(0, 8).toUpperCase()}`} />
            <StatementRow label="Fecha" value={formatDateTime(result.createdAt)} />
            <StatementRow
              label={result.side === "buy" ? "Recibes" : "Entregas"}
              value={
                result.side === "buy"
                  ? `${tokenAmount(result.outAmountUi)} ${symbol}`
                  : `${tokenAmount(result.inAmountUi)} ${symbol}`
              }
            />
            <StatementRow label={totalLabel} value={totalValue} strong />
          </dl>

          <p className="text-[13px] leading-relaxed text-fg-body">
            Asiento en la demo: el saldo y las posiciones son ficticios.
          </p>
        </div>

        <SheetActionBar status="La orden quedó confirmada.">
          <Button asChild size="lg" className="min-h-12 w-full touch-manipulation text-[15px] md:text-base">
            <Link href="/app/cartera">{t.trade.portfolio}</Link>
          </Button>
          <div className={cn("mt-1 flex items-center", result.signature ? "justify-between" : "justify-end")}>
            {result.signature ? (
              <a
                href={explorerTxUrl(result.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
              >
                {t.trade.explorer}
                <span className="sr-only"> {t.trade.explorerNew}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 12 12"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              Cerrar
            </button>
          </div>
        </SheetActionBar>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-full flex-col">
        <div role="alert" className="flex flex-1 flex-col gap-3 pt-1 pb-8">
          <p className="text-[13px] leading-5 text-down">Error</p>
          <p className="text-xl leading-snug text-balance text-fg">{flowError ?? t.trade.orderFailed}</p>
        </div>
        <SheetActionBar status="Puedes revisar el monto e intentarlo de nuevo.">
          <Button
            size="lg"
            className="min-h-12 w-full touch-manipulation text-[15px] md:text-base"
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

  const hint =
    block === "min"
      ? fill(t.trade.min, { amount: formatMoney(MIN_TRADE_USD, "USD") })
      : block === "cap"
        ? `El tope por orden de ${symbol} es ${formatMoney(cap, "USD")}.`
        : block === "funds"
          ? mode === "buy"
            ? "Saldo insuficiente. Prueba con un monto menor."
            : `No tienes ${symbol} suficiente para esta venta.`
          : block === "price"
            ? t.trade.noPrice
            : null;

  const quoteReady = fresh && remainingMs > 0;
  const expired = quote !== null && !quoting && quoteError === null && remainingMs <= 0;
  const ctaAmount =
    amount > 0
      ? mode === "buy"
        ? formatMoney(amount, "USD")
        : `${tokenAmount(amount)} ${symbol}`
      : null;
  const reviewAmount =
    fresh && quote ? (mode === "buy" ? formatMoney(quote.inAmountUi, "USD") : formatMoney(quote.outAmountUi, "USD")) : null;
  const canReview = block === null && quoteReady && !quoteError;
  const canConfirm = phase === "review" && canReview && pubkey !== null;
  const maxAmount = mode === "buy" ? (cash > 0 ? Math.min(cash, cap) : undefined) : held;

  // Una sola línea de estado para todo el flujo. El motivo del bloqueo y el
  // estado de la cotización comparten el mismo lugar, encima del CTA.
  let status = "Escribe un monto para cotizar.";
  let tone: "muted" | "down" = "muted";
  let statusAction: StatusAction = null;

  if (quoteError) {
    status = quoteError;
    tone = "down";
    statusAction = { label: t.states.retry, onClick: () => setRefreshKey((key) => key + 1) };
  } else if (expired) {
    status = "La cotización venció.";
    tone = "down";
    statusAction = { label: "Recotizar", onClick: () => setRefreshKey((key) => key + 1) };
  } else if (phase === "review" && !pubkey) {
    status = t.trade.noWallet;
    tone = "down";
  } else if (hint) {
    status = hint;
    tone = "down";
    if (block === "price") {
      statusAction = {
        label: t.states.retry,
        onClick: () => {
          void prices.refetch();
        },
      };
    }
  } else if (block === "wait") {
    status = "Cargando el precio…";
  } else if (quoting || !quote) {
    status = t.trade.quoting;
  } else {
    status = `Cotización lista · vence en ${countdownLabel(remainingMs)}`;
  }

  const caption = fresh && quote
    ? mode === "buy"
      ? `Recibes ≈ ${tokenAmount(quote.outAmountUi)} ${symbol}`
      : `Recibes ≈ ${formatMoney(quote.outAmountUi, "USD")}`
    : quoting
      ? "Calculando el equivalente…"
      : mode === "buy"
        ? `El equivalente en ${symbol} aparece al cotizar.`
        : "El equivalente en dólares aparece al cotizar.";

  if (phase === "review") {
    const rows: { label: string; value: string }[] = [];
    let total: { label: string; value: string } | undefined;
    if (quote && fresh) {
      rows.push(
        { label: `Precio por ${symbol}`, value: formatPrice(quote.pricePerShareUsd) ?? "sin dato" },
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
      );
      if (quote.costs.tokenAccountRentSol > 0) {
        rows.push({
          label: t.trade.rent,
          value: `${tokenFormatter.format(quote.costs.tokenAccountRentSol)} SOL`,
        });
      }
      rows.push(
        { label: t.trade.impact, value: percentFormatter.format(quote.costs.priceImpactPct) },
        { label: t.trade.slippage, value: percentFormatter.format(quote.costs.slippageBps / 10_000) },
      );
      total = {
        label: "Total estimado",
        value: formatMoney(mode === "buy" ? quote.inAmountUi : quote.outAmountUi, "USD"),
      };
    }

    const heroValue =
      quote && fresh ? (mode === "buy" ? tokenAmount(quote.outAmountUi) : formatMoney(quote.outAmountUi, "USD")) : "—";
    const sub =
      quote && fresh
        ? mode === "buy"
          ? `Pagas ${formatMoney(quote.inAmountUi, "USD")}`
          : `Vendes ${tokenAmount(quote.inAmountUi)} ${symbol}`
        : null;

    return (
      <div className="flex min-h-full flex-col">
        <div className="flex flex-col gap-6 pb-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPhase("form")}
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              <IconBack className="size-4" aria-hidden="true" />
              {t.trade.back}
            </button>
            <span className="num text-[13px] tracking-[0.01em] text-fg-muted">{symbol}</span>
          </div>

          <section className="border-y border-border py-5">
            <p className="text-[13px] leading-5 text-fg-muted">{t.trade.youReceive}</p>
            <p className="mt-2 flex min-h-9 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="num text-[2rem] leading-none tracking-[-0.02em] text-fg">{heroValue}</span>
              {quote && fresh && mode === "buy" ? (
                <span className="num text-[13px] leading-4 tracking-[0.045em] text-fg-muted uppercase">
                  {symbol}
                </span>
              ) : null}
            </p>
            {sub ? <p className="mt-3 text-[13px] leading-relaxed text-fg-body">{sub}</p> : null}
          </section>

          {rows.length > 0 ? <CostBreakdown rows={rows} total={total} /> : null}

          <p className="text-[13px] leading-relaxed text-fg-muted">
            {quote && quote.route !== "mock"
              ? "Cotización real de Jupiter en Solana y asiento en la demo."
              : "Cotización de referencia en la demo; el asiento es ficticio."}{" "}
            El precio puede variar y la cotización vence. No es asesoría de inversión.
          </p>
        </div>

        <SheetActionBar status={status} statusId={statusId} tone={tone} action={statusAction} announce={!quoteReady}>
          <ActionButton disabled={!canConfirm} amount={reviewAmount} onClick={() => void confirm()}>
            {t.trade.confirm}
          </ActionButton>
        </SheetActionBar>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-6 pb-8">
        {header}

        <AmountInput
          id={`${statusId}-amount`}
          label={mode === "buy" ? "Monto en dólares" : `Cantidad de ${symbol}`}
          value={amountRaw}
          onChange={setAmountRaw}
          currency={quoteCurrency}
          labels={{ USDC: "USD", SHARES: symbol }}
          suffix={mode === "sell" ? symbol : undefined}
          maxLabel={t.trade.max}
          max={maxAmount}
          describedBy={statusId}
          invalid={block === "min" || block === "cap" || block === "funds"}
          caption={caption}
          inputClassName="min-h-14 py-2"
          chipClassName="min-h-12 shrink-0 px-4 text-[13px] whitespace-nowrap"
          chipsClassName="no-scrollbar flex-nowrap justify-start overflow-x-auto pb-1 sm:flex-wrap sm:justify-start sm:pb-0"
        />

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-6">
            <span className="text-[13px] leading-5 text-fg-muted">
              {mode === "buy" ? "Disponible en la demo" : "Tienes"}
            </span>
            <span className="num text-[13px] leading-5 text-fg">
              {mode === "buy" ? formatMoney(cash, "USD") : `${tokenAmount(held)} ${symbol}`}
            </span>
          </div>
          <p className="text-[13px] leading-5 text-fg-muted">
            {mode === "buy"
              ? `Mínimo ${formatMoney(MIN_TRADE_USD, "USD")} · Tope por orden ${formatMoney(cap, "USD")}`
              : `Mínimo ${formatMoney(MIN_TRADE_USD, "USD")}`}
          </p>
        </div>

        {isLst ? <p className="text-[13px] leading-relaxed text-fg-body">{LST_YIELD_NOTICE}</p> : null}
        {isUsdy ? <p className="text-[13px] leading-relaxed text-fg-body">{USDY_YIELD_NOTICE}</p> : null}
        <p className="text-[13px] leading-relaxed text-fg-body">{NON_CUSTODY_LINE}</p>
      </div>

      <SheetActionBar status={status} statusId={statusId} tone={tone} action={statusAction} announce={!quoteReady}>
        <ActionButton disabled={!canReview} amount={ctaAmount} onClick={() => setPhase("review")}>
          {t.trade.review}
        </ActionButton>
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
      fill
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
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${symbol}-precio`} className="label">
          Precio de {name} ({symbol})
        </h2>
        <p className="num text-4xl leading-none tracking-tight text-fg tabular-nums">
          {shownPrice ?? (
            <span className="text-lg leading-7 text-fg-muted">
              {prices.isPending ? "Consultando…" : "Sin precio"}
            </span>
          )}
        </p>
        {shownPrice ? null : (
          <p className="text-[13px] leading-relaxed text-fg-body">
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

      <p className="text-[13px] leading-5 text-fg-muted">
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

      {!real && portfolio.isSuccess && !(held > 0) ? (
        <p className="text-[13px] leading-5 text-fg-muted">
          Aún no tienes {symbol}: primero compra para poder vender.
        </p>
      ) : null}

      <p className="text-[13px] leading-relaxed text-fg-body">{NON_CUSTODY_LINE}</p>

      <CryptoTradeSheet
        symbol={symbol}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        mode={mode}
        maxOrderUsd={cap}
      />
    </Card>
  );
}
