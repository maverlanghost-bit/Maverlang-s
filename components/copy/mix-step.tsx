"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Messages } from "@/content/i18n/es-CL";
import { ApiError, buildTrade, quoteTrade, submitTrade } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useSignTrade } from "@/lib/auth/sign-transaction";
import { cn } from "@/lib/cn";
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

/** Fila de dato con hairline: rótulo a la izquierda, cifra tabular a la derecha. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="min-w-0 flex-1 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd className="num shrink-0 text-right text-[13px] leading-5 font-medium whitespace-nowrap tabular-nums text-fg">
        {children}
      </dd>
    </div>
  );
}

/**
 * Recorrido de la mezcla con DINERO REAL: una orden a la vez con las rutas de
 * siempre (`quoteTrade → buildTrade → firma → submitTrade`). Nada nuevo toca el
 * motor de compra: no hay transacción agrupada ni camino propio.
 *
 * Cada pierna se confirma y se firma por separado. Si falla, se reintenta una
 * vez; si vuelve a fallar se salta y el resto sigue. «Detener» corta el resto.
 * Una sola CTA por paso; los motivos van siempre encima del botón.
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
    const left = Math.max(0, legs.length - outcomes.length);
    const spent = bought.reduce((sum, item) => sum + item.usd, 0);
    const leftUsdc = Math.max(0, totalUsd - spent);
    return (
      <div role="status" aria-live="polite" className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
            {phase === "done" ? "Mezcla terminada" : "Mezcla detenida"}
          </p>
          <p className="num text-[28px] leading-none font-medium tracking-tight tabular-nums text-fg sm:text-[32px]">
            {formatUsd(spent)}
          </p>
          <p className="num text-[13px] leading-5 tabular-nums text-fg-muted">
            {bought.length} compradas · {skipped.length} saltadas
            {left > 0 ? ` · ${left} pendientes` : ""}
          </p>
        </div>

        <dl className="border-t border-border/70">
          <Row label="Compraste">{formatUsd(spent)}</Row>
          <Row label="Quedó en USDC">{formatUsd(leftUsdc)}</Row>
          <Row label="Plan">{planId.slice(0, 8).toUpperCase()}</Row>
        </dl>

        {bought.length > 0 ? (
          <ul className="flex flex-col border-t border-border/70">
            {bought.map((item, position) => (
              <li
                key={`b-${item.symbol}-${position}`}
                className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 font-mono text-[15px] leading-5 font-medium break-words text-fg">
                  {item.symbol}
                </span>
                <span className="num shrink-0 text-[13px] leading-5 tabular-nums text-fg-muted">
                  {formatUsd(item.usd)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {skipped.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
              Saltadas
            </h3>
            <ul className="flex flex-col border-t border-border/70">
              {skipped.map((item, position) => (
                <li
                  key={`s-${item.symbol}-${position}`}
                  className="flex flex-col gap-0.5 border-b border-border/70 py-2.5 last:border-b-0"
                >
                  <span className="font-mono text-[15px] leading-5 font-medium text-fg">{item.symbol}</span>
                  {item.reason ? (
                    <span className="text-[13px] leading-relaxed text-fg-muted">{item.reason}</span>
                  ) : null}
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
    <div className="flex min-w-0 flex-col gap-5">
      <div aria-live="polite" className="flex flex-col gap-1.5">
        <p className="num text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
          Paso {index + 1} de {legs.length}
        </p>
        <div className="flex min-w-0 items-baseline justify-between gap-4">
          <p className="min-w-0 font-mono text-[22px] leading-none font-medium tracking-tight break-words text-fg">
            {leg ? leg.symbol : "Preparando…"}
          </p>
          {leg ? (
            <p className="num shrink-0 text-[22px] leading-none font-medium tabular-nums text-fg">
              {formatUsd(leg.usd)}
            </p>
          ) : null}
        </div>
        <div aria-hidden className="mt-1 h-px w-full bg-border">
          <div
            className="h-px bg-fg transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${Math.round((index / Math.max(legs.length, 1)) * 100)}%` }}
          />
        </div>
      </div>

      {quote && legState !== "quoting" ? (
        <dl className="border-t border-border/70">
          <Row label="Recibes ≈">{formatShares(quote.outAmountUi)}</Row>
          <Row label="Precio por acción">{formatUsd(quote.pricePerShareUsd)}</Row>
          <Row label="La cotización vence en">
            <span className={cn(remainingSeconds > 0 ? "text-fg" : "text-down")}>
              {remainingSeconds > 0 ? `${remainingSeconds} s` : "vencida"}
            </span>
          </Row>
        </dl>
      ) : null}

      {/* Estado y motivos, siempre encima del botón: el botón no se mueve solo. */}
      <div className="flex flex-col gap-2">
        {legState === "quoting" ? (
          <p role="status" className="text-[13px] leading-relaxed text-fg-muted">
            {attempt === 1 ? "Reintentando: cotizando de nuevo…" : "Cotizando la orden…"}
          </p>
        ) : null}
        {legState === "signing" ? (
          <p role="status" className="text-[13px] leading-relaxed text-fg-muted">
            Firma la orden en tu billetera…
          </p>
        ) : null}
        {legState === "submitting" ? (
          <p role="status" className="text-[13px] leading-relaxed text-fg-muted">
            Enviando la orden…
          </p>
        ) : null}
        {notice ? (
          <p role="status" aria-live="polite" className="text-[13px] leading-relaxed text-fg-muted">
            {notice}
          </p>
        ) : null}
        {session.status !== "loading" && !pubkey ? (
          <p className="text-[13px] leading-relaxed text-fg-body">
            {t.trade.noWallet} Conecta tu billetera para firmar cada orden.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] leading-relaxed text-down">
            {error}
          </p>
        ) : null}
      </div>

      {retryAvailable ? (
        <Button size="lg" className="min-h-12 w-full touch-manipulation text-[15px]" onClick={retry}>
          Reintentar
        </Button>
      ) : (
        <Button
          size="lg"
          className="min-h-12 w-full touch-manipulation text-[15px]"
          disabled={!canConfirm || !pubkey}
          loading={busy}
          onClick={() => void confirm()}
        >
          Confirmar y firmar
        </Button>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="lg"
          className="min-h-11 px-2 text-[13px] font-medium"
          disabled={busy}
          onClick={skipCurrent}
        >
          Saltar esta
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="min-h-11 px-2 text-[13px] font-medium"
          disabled={busy}
          onClick={stop}
        >
          Detener
        </Button>
      </div>
    </div>
  );
}
