"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ApiError, buildSend, getTradeStatus, submitTrade } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useSignTrade } from "@/lib/auth/sign-transaction";
import { useBalances } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isOfficialMint } from "@/lib/solana/allowlist";
import { addressesEqual, isSolanaAddress } from "@/lib/solana/address";
import { parseAmount } from "@/lib/trade/amount";
import type { Balance, Order } from "@/lib/types";
import { formatAssetAmount } from "@/lib/wallet/display";
import { explorerTxUrl } from "@/lib/wallet/explorer";
import { formatSol, sendNetworkCost, solCoversFee } from "@/lib/wallet/send-cost";
import type { Messages } from "@/content/i18n/es-CL";

const POLL_MS = 1_000;
const POLL_BUDGET_MS = 20_000;
const DEPOSIT_HREF = "/app/billetera/depositar";

type Phase = "form" | "review" | "signing" | "submitting" | "done" | "error";

type Draft = {
  mint: string;
  symbol: string;
  amount: number;
  to: string;
  own: boolean;
  networkFeeSol: number;
  tokenAccountRentSol: number;
};

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

function readMockError() {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("mockError")?.trim();
  return code ? code : null;
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
    if (Date.now() - started > POLL_BUDGET_MS) throw new ApiError("UPSTREAM", "El envío no confirmó a tiempo.");
    await sleep(POLL_MS);
  }
}

function failureMessage(t: Messages, error: unknown): string | null {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof ApiError) {
    if (error.code === "QUOTE_EXPIRED") return t.wallet.reviewExpired;
    if (error.code === "VALIDATION") return t.wallet.validation;
    if (error.code === "NOT_FOUND") return t.wallet.notFound;
    if (error.code === "MINT_NOT_ALLOWED") return t.wallet.mintBlocked;
    return t.trade.errors[error.code];
  }
  if (error instanceof Error && error.message === "NO_WALLET") return t.wallet.noWallet;
  return t.wallet.signFailed;
}

function sendable(rows: readonly Balance[]) {
  return rows.filter((row) => row.symbol !== "SOL" && row.uiAmount > 0 && isOfficialMint(row.mint));
}

/** Si el monto escrito es el máximo (o el redondeo del input), se envía el saldo entero. */
function amountToSend(typed: number, max: number): number {
  if (!(typed > 0)) return 0;
  if (typed > max + 1e-6) return typed;
  if (typed >= max - 1e-6) return max;
  return typed;
}

function Spinner() {
  return (
    <svg className="size-5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SendScreen() {
  const { t } = useT();
  const session = useSession();
  const sign = useSignTrade();
  const balances = useBalances();
  const queryClient = useQueryClient();
  const destinationId = useId();
  const hintId = useId();
  const [mint, setMint] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const mounted = useRef(true);
  const confirming = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (session.status === "loading" || balances.isPending) {
    return <LoadingState label={t.states.loading} />;
  }

  const pubkey = session.user?.walletAddress?.trim() ?? "";
  const walletOk = isSolanaAddress(pubkey);
  const assets = sendable(balances.data ?? []);
  const selectedMint = mint && assets.some((row) => row.mint === mint) ? mint : (assets[0]?.mint ?? "");
  const selected = assets.find((row) => row.mint === selectedMint) ?? null;
  const sol = (balances.data ?? []).find((row) => row.symbol === "SOL");
  const trimmedTo = destination.trim();
  const addressOk = isSolanaAddress(trimmedTo);
  const showInvalid = trimmedTo.length > 0 && !addressOk;
  const own = addressOk && walletOk && addressesEqual(trimmedTo, pubkey);
  const amount = parseAmount(amountRaw);
  const max = selected?.uiAmount ?? 0;
  const sending = selected ? amountToSend(amount, max) : 0;
  const over = amount > max + 1e-6;
  const cost = addressOk && walletOk ? sendNetworkCost(trimmedTo, pubkey) : null;
  const solOk = cost ? solCoversFee(sol?.uiAmount ?? 0, cost) : false;
  const canReview = Boolean(selected && addressOk && walletOk && sending > 0 && !over && cost && solOk);

  async function confirm() {
    if (confirming.current || phase !== "review" || !draft || !walletOk) return;
    confirming.current = true;
    setPhase("signing");
    setFlowError(null);
    const mockError = readMockError();
    try {
      const built = await buildSend(
        { to: draft.to, mint: draft.mint, amountUi: draft.amount, userPublicKey: pubkey },
        mockError,
      );
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
        setFlowError(order.error?.trim() || t.wallet.sendFailed);
        setPhase("error");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      setSignature(order.signature);
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

  function openReview() {
    if (!canReview || !selected || !cost) return;
    setDraft({
      mint: selected.mint,
      symbol: selected.symbol,
      amount: sending,
      to: trimmedTo,
      own,
      networkFeeSol: cost.networkFeeSol,
      tokenAccountRentSol: cost.tokenAccountRentSol,
    });
    setPhase("review");
  }

  const shell = (body: ReactNode) => (
    <div className="flex flex-col gap-6">
      <Link href="/app/billetera" className="w-fit text-sm font-medium text-fg underline underline-offset-4">
        {t.wallet.back}
      </Link>
      <PageHeader title={t.wallet.sendTitle} description={t.wallet.sendLead} />
      {body}
    </div>
  );

  if (balances.isError) {
    return shell(
      <ErrorState
        title={t.wallet.loadError}
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={() => {
          void balances.refetch();
        }}
      />,
    );
  }

  if (phase === "signing" || phase === "submitting") {
    return shell(
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
        <Spinner />
        <p className="text-lg text-fg">{phase === "signing" ? t.trade.signing : t.trade.submitting}</p>
      </div>,
    );
  }

  if (phase === "done" && draft) {
    return shell(
      <div role="status" aria-live="polite" className="flex flex-col items-stretch gap-4 py-2 text-center">
        <p className="text-2xl text-fg">{t.trade.done}</p>
        <p className="text-sm text-balance text-fg-body">
          {fill(t.wallet.doneBody, { amount: formatAssetAmount(draft.symbol, draft.amount), symbol: draft.symbol })}
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/app/billetera#actividad">{t.wallet.viewActivity}</Link>
        </Button>
        {signature ? (
          <Button asChild variant="secondary" size="lg" className="w-full">
            <a href={explorerTxUrl(signature)} target="_blank" rel="noopener noreferrer">
              {t.trade.explorer}
              <span className="sr-only"> {t.trade.explorerNew}</span>
            </a>
          </Button>
        ) : null}
      </div>,
    );
  }

  if (phase === "error") {
    return shell(
      <ErrorState
        title={flowError ?? t.wallet.sendFailed}
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={() => {
          setFlowError(null);
          setPhase("form");
        }}
      />,
    );
  }

  if (phase === "review" && draft) {
    const rows = [{ label: t.wallet.network, value: formatSol(draft.networkFeeSol) }];
    if (draft.tokenAccountRentSol > 0) rows.push({ label: t.wallet.rent, value: formatSol(draft.tokenAccountRentSol) });
    return shell(
      <div className="flex flex-col gap-5">
        <p className="text-center text-2xl text-balance text-fg">
          {fill(t.wallet.reviewLead, { amount: formatAssetAmount(draft.symbol, draft.amount), symbol: draft.symbol })}
        </p>
        <p className="num break-all text-center text-sm text-fg-muted">{draft.to}</p>
        {draft.own ? <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-fg">{t.wallet.ownAddress}</p> : null}
        <CostBreakdown rows={rows} />
        {draft.tokenAccountRentSol > 0 ? <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.rentNote}</p> : null}
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">{t.wallet.irreversible}</p>
        <Button size="lg" className="w-full" onClick={() => void confirm()}>
          {t.trade.confirm}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setPhase("form")}>
          {t.trade.back}
        </Button>
      </div>,
    );
  }

  if (!walletOk) {
    return shell(<p className="text-sm text-fg-muted">{t.wallet.noWallet}</p>);
  }

  if (assets.length === 0) {
    return shell(
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-fg-body">{t.wallet.noAssets}</p>
        <Button asChild>
          <Link href={DEPOSIT_HREF}>{t.wallet.deposit}</Link>
        </Button>
      </div>,
    );
  }

  const currency = selected?.symbol === "USDC" ? "USDC" : "SHARES";
  const hint = !walletOk
    ? t.wallet.noWallet
    : showInvalid
      ? t.wallet.invalidAddress
      : over
        ? t.wallet.overMax
        : cost && !solOk
          ? t.wallet.solShort
          : null;

  return shell(
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        openReview();
      }}
    >
      <Select
        label={t.wallet.asset}
        placeholder={t.wallet.assetPlaceholder}
        value={selectedMint}
        onValueChange={(next) => {
          setMint(next);
          setAmountRaw("");
        }}
        options={assets.map((row) => ({
          value: row.mint,
          label: `${row.symbol} · ${formatAssetAmount(row.symbol, row.uiAmount)}`,
        }))}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor={destinationId} className="text-sm font-medium text-fg">
          {t.wallet.destination}
        </label>
        <Input
          id={destinationId}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder={t.wallet.destinationPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={showInvalid || undefined}
          aria-describedby={hintId}
          className="num"
        />
        {own ? <p className="text-sm text-warn">{t.wallet.ownAddress}</p> : null}
      </div>
      <AmountInput
        label={t.trade.amount}
        value={amountRaw}
        onChange={setAmountRaw}
        currency={currency}
        labels={{ USDC: "USDC", SHARES: t.trade.shares, CLP: "CLP", USD: "USD" }}
        maxLabel={t.trade.max}
        suffix={currency === "SHARES" ? t.trade.shareSuffix : undefined}
        max={max}
        describedBy={hintId}
        invalid={over}
      />
      {selected ? (
        <p className="text-center text-sm text-fg-muted">
          {fill(t.wallet.available, { amount: formatAssetAmount(selected.symbol, selected.uiAmount) })}
        </p>
      ) : null}
      <p id={hintId} role={hint ? "alert" : undefined} className={hint ? "text-center text-sm text-down" : "sr-only"}>
        {hint ?? t.wallet.irreversible}
      </p>
      <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">{t.wallet.irreversible}</p>
      <Button type="submit" size="lg" className="w-full" disabled={!canReview}>
        {t.trade.review}
      </Button>
    </form>,
  );
}
