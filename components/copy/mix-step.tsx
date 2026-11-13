"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Messages } from "@/content/i18n/es-CL";
import { ApiError, buildTrade, quoteTrade, submitTrade } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useSignTrade } from "@/lib/auth/sign-transaction";
import { formatShares, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { TradeQuote } from "@/lib/types";

export type MixLeg = { symbol: string; usd: number };

type LegState = "quoting" | "ready" | "signing" | "submitting" | "failed";

type Outcome = { symbol: string; usd: number; status: "bought" | "skipped"; reason?: string };

/** Errores que sí vale la pena reintentar una vez (red, precio movido, cotización vencida). */
const TRANSIENT_CODES = new Set<string>(["UPSTREAM", "RATE_LIMITED", "QUOTE_EXPIRED", "PRICE_DEVIATION", "INTERNAL"]);

function isTransient(error: unknown): boolean {
  return error instanceof ApiError && TRANSIENT_CODES.has(error.code);
}

function failureText(t: Messages, error: unknown): string {
  if (error instanceof ApiError) return t.trade.errors[error.code] ?? t.trade.orderFailed;
  if (error instanceof Error && error.message === "NO_WALLET") return t.trade.noWallet;
  return t.trade.signFailed;
}

/**
 * Recorrido de la mezcla con DINERO REAL: una orden a la vez con las rutas de
 * siempre (`quoteTrade → buildTrade → firma → submitTrade`). Nada nuevo toca el
 * motor de compra: no hay transacción agrupada ni camino propio.
 *
 * Cada pierna se confirma y se firma por separado. Si falla, se reintenta una
 * vez; si vuelve a fallar se salta y el resto sigue. «Detener» corta el resto.
 */
export function MixStep({ planId, legs, totalUsd }: { planId: string; legs: MixLeg[]; totalUsd: number }) {
  const { t } = useT();
  const session = useSession();
  const sign = useSignTrade();
  const queryClient = useQueryClient();

  const wallet = session.user?.walletAddress?.trim() ?? "";
  const pubkey = wallet.length >= 32 ? wallet : null;

  const indexRef = useRef(0);
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const activeRef = useRef(true);

  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [quoteKey, setQuoteKey] = useState(0);
  const [legState, setLegState] = useState<LegState>("quoting");
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [phase, setPhase] = useState<"running" | "done" | "stopped">("running");
  const [now, setNow] = useState(() => Date.now());

  const finish = useCallback(
    (outcome: Outcome) => {
      if (!activeRef.current) return;
      setError(null);
      setOutcomes((previous) => [...previous, outcome]);
      const next = indexRef.current + 1;
      attemptRef.current = 0;
      setAttempt(0);
      if (next >= legs.length) {
        setPhase("done");
        setQuote(null);
        setLegState("ready");
        return;
      }
      indexRef.current = next;
      setIndex(next);
      setQuote(null);
      setLegState("quoting");
      setQuoteKey((key) => key + 1);
    },
    [legs.length],
  );

  const refreshQuote = useCallback(() => {
    setError(null);
    setQuote(null);
    setLegState("quoting");
    setQuoteKey((key) => key + 1);
  }, []);

  const retry = useCallback(() => {
    attemptRef.current = 1;
    setAttempt(1);
    setError(null);
    setQuote(null);
    setLegState("quoting");
    setQuoteKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const leg = legs[index];
    if (!leg) return;
    let alive = true;
    void quoteTrade({
      side: "buy",
      symbol: leg.symbol,
      amount: leg.usd,
      amountCurrency: "USDC",
      ...(pubkey ? { userPublicKey: pubkey } : {}),
    })
      .then((next) => {
        if (!alive) return;
        setQuote(next);
        // Si una firma está en curso, su estado manda: no se reabre el botón.
        setLegState((current) => (current === "signing" || current === "submitting" ? current : "ready"));
        setNotice((current) => (current && current.startsWith("Se saltó") ? current : null));
      })
      .catch((thrown: unknown) => {
        if (!alive) return;
        const message = failureText(t, thrown);
        if (attempt >= 1) {
          setNotice(`Se saltó ${leg.symbol}: ${message}`);
          finish({ symbol: leg.symbol, usd: leg.usd, status: "skipped", reason: message });
          return;
        }
        setNotice(null);
        setError(message);
        setLegState("failed");
      });
    return () => {
      alive = false;
    };
  }, [attempt, finish, index, legs, phase, pubkey, quoteKey, t]);

  useEffect(() => {
    if (!quote) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [quote]);

  async function confirm() {
    if (busyRef.current || phase !== "running") return;
    const leg = legs[indexRef.current];
    const current = quote;
    if (!leg || !current) return;
    if (Date.parse(current.expiresAt) <= Date.now()) {
      setNotice("La cotización venció. Actualizamos el precio; confirma de nuevo.");
      refreshQuote();
      return;
    }
    if (!pubkey) {
      setError(`${t.trade.noWallet} Conecta tu billetera para copiar con dinero real.`);
      setLegState("failed");
      return;
    }
    busyRef.current = true;
    setLegState("signing");
    setError(null);
    setNotice(null);
    try {
      const built = await buildTrade({ quoteId: current.id, userPublicKey: pubkey });
      const signed = await sign(built.transactionBase64);
      setLegState("submitting");
      const submitted = await submitTrade({ requestId: built.requestId, signedTransactionBase64: signed });
      if (submitted.status === "failed" || submitted.status === "expired") {
        throw new ApiError("UPSTREAM", "La orden no se completó.");
      }
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      finish({ symbol: leg.symbol, usd: leg.usd, status: "bought" });
    } catch (thrown) {
      const message = failureText(t, thrown);
      if (attemptRef.current >= 1) {
        setNotice(`Se saltó ${leg.symbol}: ${message}`);
        finish({ symbol: leg.symbol, usd: leg.usd, status: "skipped", reason: message });
      } else if (isTransient(thrown)) {
        setNotice(`No pasó (${message}) Reintentando ${leg.symbol} una vez.`);
        retry();
      } else {
        setError(`${message} Puedes reintentar una vez o saltar esta orden.`);
        setLegState("failed");
      }
    } finally {
      busyRef.current = false;
    }
  }

  function skipCurrent() {
    const leg = legs[indexRef.current];
    if (!leg || phase !== "running") return;
    finish({ symbol: leg.symbol, usd: leg.usd, status: "skipped", reason: "La saltaste." });
  }

  function stop() {
    if (phase !== "running") return;
    activeRef.current = false;
    setPhase("stopped");
    setQuote(null);
    setLegState("ready");
  }

  if (phase === "done" || phase === "stopped") {
    const bought = outcomes.filter((item) => item.status === "bought");
    const skipped = outcomes.filter((item) => item.status === "skipped");
    const pending = Math.max(0, legs.length - outcomes.length);
    const spent = bought.reduce((sum, item) => sum + item.usd, 0);
    const leftUsdc = Math.max(0, totalUsd - spent);
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-surface-1 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-medium text-fg">
            {phase === "done" ? "Mezcla terminada" : "Mezcla detenida"}
          </p>
          <p className="text-sm text-fg-muted tabular-nums">
            {bought.length} compradas · {skipped.length} saltadas
            {pending > 0 ? ` · ${pending} pendientes` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-bg/60 p-3 text-sm tabular-nums">
          <p className="text-fg">Compraste {formatUsd(spent)} en acciones.</p>
          <p className="mt-1 text-fg-muted">Quedó en USDC: {formatUsd(leftUsdc)}.</p>
        </div>
        {bought.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {bought.map((item) => (
              <li key={`b-${item.symbol}`} className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                <span className="font-medium text-fg">{item.symbol}</span>
                <span className="text-fg-muted">{formatUsd(item.usd)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {skipped.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Saltadas</p>
            <ul className="flex flex-col gap-1.5">
              {skipped.map((item) => (
                <li key={`s-${item.symbol}`} className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium text-fg">{item.symbol}</span>
                  {item.reason ? <span className="text-xs leading-relaxed text-fg-muted">{item.reason}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button asChild variant="secondary" size="lg" className="min-h-12 w-full touch-manipulation">
          <Link href="/app/cartera">Ver en cartera</Link>
        </Button>
      </div>
    );
  }

  const leg = legs[index];
  const remainingSeconds = quote ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - now) / 1000)) : 0;
  const busy = legState === "signing" || legState === "submitting";
  const canConfirm = legState === "ready" && quote !== null && !busy;
  const retryAvailable = legState === "failed" && attempt === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted tabular-nums">
          {`Plan ${planId.slice(0, 8).toUpperCase()}`}
        </p>
        <p className="text-base font-medium text-fg tabular-nums" aria-live="polite">
          {leg ? `Orden ${index + 1} de ${legs.length} · ${leg.symbol} · ${formatUsd(leg.usd)}` : "Preparando la mezcla…"}
        </p>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${Math.round((index / Math.max(legs.length, 1)) * 100)}%` }}
          />
        </div>
      </div>

      {legState === "quoting" ? (
        <p role="status" className="text-sm text-fg-muted">
          {attempt === 1 ? "Reintentando: cotizando de nuevo…" : "Cotizando la orden…"}
        </p>
      ) : null}

      {quote && legState !== "quoting" ? (
        <div className="rounded-xl border border-border/70 bg-bg/60 p-3 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-fg-muted">Recibes ≈</span>
            <span className="font-medium text-fg">{formatShares(quote.outAmountUi)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-fg-muted">Precio por acción</span>
            <span className="font-medium text-fg">{formatUsd(quote.pricePerShareUsd)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-fg-muted">La cotización vence en</span>
            <span className={remainingSeconds > 0 ? "font-medium text-fg" : "font-medium text-down"}>
              {remainingSeconds > 0 ? `${remainingSeconds} s` : "vencida"}
            </span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role="status" aria-live="polite" className="text-sm leading-relaxed text-fg-muted">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm leading-relaxed text-down">
          {error}
        </p>
      ) : null}

      {session.status !== "loading" && !pubkey ? (
        <p className="text-sm leading-relaxed text-warn">{t.trade.noWallet} Conecta tu billetera para firmar cada orden.</p>
      ) : null}

      {legState === "signing" ? (
        <p role="status" className="text-sm text-fg-muted">
          Firma la orden en tu billetera…
        </p>
      ) : null}
      {legState === "submitting" ? (
        <p role="status" className="text-sm text-fg-muted">
          Enviando la orden…
        </p>
      ) : null}

      {retryAvailable ? (
        <Button size="lg" className="min-h-12 w-full touch-manipulation text-base" onClick={retry}>
          Reintentar
        </Button>
      ) : (
        <Button
          size="lg"
          className="min-h-12 w-full touch-manipulation text-base"
          disabled={!canConfirm || !pubkey}
          loading={busy}
          onClick={() => void confirm()}
        >
          Confirmar y firmar
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="lg"
          className="min-h-12 w-full touch-manipulation"
          disabled={busy}
          onClick={skipCurrent}
        >
          Saltar esta
        </Button>
        <Button variant="ghost" size="lg" className="min-h-12 w-full touch-manipulation" disabled={busy} onClick={stop}>
          Detener
        </Button>
      </div>
    </div>
  );
}
