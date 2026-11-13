"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { CostBreakdown } from "@/components/domain/cost-breakdown";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SavedRecipientsBar } from "@/components/wallet/saved-recipients-bar";
import { AddressVerificationBadge } from "@/components/wallet/address-verification-badge";
import { WithdrawalLimitsCard } from "@/components/wallet/withdrawal-limits-card";
import { ApiError, buildSend, getSendStatus, submitSend } from "@/lib/api/client";
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
    const order = await getSendStatus(id, mockError);
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

const backLink =
  "inline-flex min-h-11 w-fit items-center text-sm font-medium text-fg underline decoration-fg/40 underline-offset-4 hover:decoration-fg";

export function SendScreen() {
  const { t } = useT();
  const session = useSession();
  const sign = useSignTrade();
  const balances = useBalances();
  const queryClient = useQueryClient();
  const destinationId = useId();
  const addressStatusId = useId();
  const amountHintId = useId();
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
  const amountHint = over ? t.wallet.overMax : cost && !solOk ? t.wallet.solShort : null;

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
      // T42: el envío se confirma en las rutas propias (`/api/wallet/send/*`),
      // que pasan por el libro de retiros. En demo sin sesión esas rutas caen
      // al motor mock, igual que antes.
      const submitted = await submitSend(
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
      <Link href="/app/billetera" className={backLink}>
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
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-1 px-4 py-3 text-center">
          <p className="label">{t.wallet.destination}</p>
          <p className="num text-[13px] leading-relaxed break-all text-fg">{draft.to}</p>
        </div>
        {draft.own ? <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-fg">{t.wallet.ownAddress}</p> : null}
        <CostBreakdown rows={rows} />
        {draft.tokenAccountRentSol > 0 ? <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.rentNote}</p> : null}
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm leading-relaxed font-medium text-fg">{t.wallet.irreversible}</p>
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
    return shell(
      <Card>
        <p className="text-sm leading-relaxed text-fg-body">{t.wallet.noWallet}</p>
      </Card>,
    );
  }

  if (assets.length === 0) {
    return shell(
      <Card className="flex flex-col items-start gap-4">
        <p className="text-sm leading-relaxed text-fg-body">{t.wallet.noAssets}</p>
        <Button asChild>
          <Link href={DEPOSIT_HREF}>{t.wallet.deposit}</Link>
        </Button>
      </Card>,
    );
  }

  const currency = selected?.symbol === "USDC" ? "USDC" : "SHARES";

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
          aria-describedby={trimmedTo ? addressStatusId : undefined}
          className="num"
        />
        <AddressVerificationBadge id={addressStatusId} address={destination} valid={addressOk} />
        {own ? <p className="text-[13px] leading-relaxed text-warn">{t.wallet.ownAddress}</p> : null}
        <SavedRecipientsBar
          currentRecipient={destination}
          onSelect={(addr) => {
            setDestination(addr);
          }}
        />
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
        describedBy={amountHint ? amountHintId : undefined}
        invalid={over}
      />

      {selected && max > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { pct: 0.25, label: "25%" },
              { pct: 0.5, label: "50%" },
              { pct: 0.75, label: "75%" },
              { pct: 1, label: "100%" },
            ] as const
          ).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setAmountRaw(String(Number((max * preset.pct).toFixed(6))))}
              className="inline-flex min-h-11 items-center rounded-full border border-control bg-bg px-3.5 text-[13px] font-medium tabular-nums text-fg transition-colors hover:bg-surface-2 sm:min-h-9"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <p className="text-sm text-fg-muted">
          {fill(t.wallet.available, { amount: formatAssetAmount(selected.symbol, selected.uiAmount) })}
        </p>
      ) : null}

      {amountHint ? (
        <p id={amountHintId} role="alert" className="text-sm text-down">
          {amountHint}
        </p>
      ) : null}

      <WithdrawalLimitsCard />

      <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm leading-relaxed font-medium text-fg">{t.wallet.irreversible}</p>

      <Button type="submit" size="lg" className="w-full" disabled={!canReview}>
        {t.trade.review}
      </Button>
    </form>,
  );
}
