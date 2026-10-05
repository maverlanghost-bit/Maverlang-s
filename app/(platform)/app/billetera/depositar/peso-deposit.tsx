"use client";

import { useEffect, useId, useRef, useState } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/components/ui/toast";
import {
  ONRAMP_CHIPS_CLP,
  ONRAMP_DEBOUNCE_MS,
  ONRAMP_METHOD_IDS,
  ONRAMP_MIN_CLP,
  type OnrampMethodId,
} from "@/config/onramp";
import type { Messages } from "@/content/i18n/es-CL";
import { ApiError, createOnrampSession } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { formatClp, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import { onrampAdapter } from "@/lib/onramp";
import type { OnrampProviderId, OnrampSession } from "@/lib/types";

import { MockWidget } from "./mock-widget";

type QuoteState = {
  key: string;
  session: OnrampSession | null;
  error: string | null;
  pending: boolean;
};

const emptyQuote: QuoteState = { key: "", session: null, error: null, pending: false };

function clpAmount(raw: string) {
  if (!/^\d+$/.test(raw)) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : 0;
}

function chipLabel(value: number) {
  const grouped = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value);
  return `$${grouped}`;
}

function failure(t: Messages, error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION") return t.wallet.depositInvalid;
    if (error.code === "UNAUTHORIZED") return t.trade.errors.UNAUTHORIZED;
  }
  return t.wallet.depositQuoteError;
}

function methodLabel(t: Messages, id: OnrampMethodId) {
  if (id === "khipu") return t.wallet.methodKhipu;
  if (id === "etpay") return t.wallet.methodEtpay;
  return t.wallet.methodTransfer;
}

export function PesoDeposit() {
  const { t } = useT();
  const session = useSession();
  const { toast } = useToast();
  const minId = useId();
  const address = session.user?.walletAddress?.trim() ?? "";
  const [raw, setRaw] = useState("");
  const [quote, setQuote] = useState<QuoteState>(emptyQuote);
  const [launching, setLaunching] = useState<OnrampProviderId | null>(null);
  const [widget, setWidget] = useState<{ session: OnrampSession; amountClp: number } | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [spent, setSpent] = useState<string | null>(null);
  const seqRef = useRef(0);
  const amount = clpAmount(raw);
  const belowMin = amount > 0 && amount < ONRAMP_MIN_CLP;
  const canQuote = amount >= ONRAMP_MIN_CLP && address.length > 0;
  const requestKey = canQuote ? `${address}|${amount}` : "";
  const live = quote.key === requestKey ? quote : emptyQuote;
  const quoting = (requestKey !== "" && quote.key !== requestKey) || live.pending;
  const ready = live.session !== null && !quoting && live.error === null && launching === null && !widgetOpen;
  const chips = ONRAMP_CHIPS_CLP.map((value) => ({ label: chipLabel(value), value }));

  useEffect(() => {
    if (!requestKey) return;
    const seq = ++seqRef.current;
    const key = requestKey;
    const handle = window.setTimeout(() => {
      if (seq !== seqRef.current) return;
      setQuote({ key, session: null, error: null, pending: true });
      void createOnrampSession({ amountClp: amount, provider: "koywe", walletAddress: address })
        .then((next) => {
          if (seq !== seqRef.current) return;
          setQuote({ key, session: next, error: null, pending: false });
        })
        .catch((error: unknown) => {
          if (seq !== seqRef.current) return;
          setQuote({ key, session: null, error: failure(t, error), pending: false });
        });
    }, ONRAMP_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
      seqRef.current += 1;
    };
  }, [address, amount, requestKey, t]);

  async function openProvider(provider: OnrampProviderId) {
    if (widgetOpen || launching || !address || amount < ONRAMP_MIN_CLP) return;
    if (live.session === null || live.pending || live.error !== null) return;
    const current = live.session;
    const reusable =
      current !== null &&
      current.provider === provider &&
      current.id !== spent &&
      Date.parse(current.expiresAt) > Date.now();
    setLaunching(provider);
    try {
      const next = reusable
        ? current
        : await createOnrampSession({ amountClp: amount, provider, walletAddress: address });
      if (provider === "koywe") setQuote({ key: requestKey, session: next, error: null, pending: false });
      const launch = onrampAdapter(next.provider).launch(next);
      if (launch.type === "dialog") {
        setWidget({ session: next, amountClp: amount });
        setWidgetOpen(true);
        return;
      }
      if (launch.type === "url") {
        const popup = window.open(launch.url, "_blank", "noopener,noreferrer");
        if (!popup) toast({ title: t.wallet.depositPopup, tone: "warn" });
        return;
      }
      toast({ title: t.wallet.depositSdk, description: t.wallet.depositSdkBody, tone: "warn" });
    } catch (error) {
      toast({ title: failure(t, error), tone: "down" });
    } finally {
      setLaunching(null);
    }
  }

  if (session.status === "loading") return <LoadingState label={t.states.loading} />;

  return (
    <Card className="flex flex-col gap-6">
      {address ? (
        <>
          <AmountInput
            id={`${minId}-amount`}
            label={t.wallet.depositAmount}
            currency="CLP"
            value={raw}
            onChange={setRaw}
            chips={chips}
            invalid={belowMin}
            describedBy={belowMin ? minId : undefined}
          />
          {belowMin ? (
            <p id={minId} role="alert" className="text-center text-sm text-down">
              {t.wallet.depositMin.replace("{amount}", formatClp(ONRAMP_MIN_CLP))}
            </p>
          ) : null}
          <Estimate
            label={t.wallet.depositEstimate}
            feeLabel={t.wallet.depositFee}
            quoting={quoting ? t.wallet.depositQuoting : null}
            error={live.error}
            usdc={live.session ? formatUsd(live.session.estimatedUsdc) : null}
            fee={live.session ? formatClp(live.session.feeClp) : null}
          />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">{t.wallet.depositMethods}</p>
            <ul className="flex flex-wrap gap-2">
              {ONRAMP_METHOD_IDS.map((id) => (
                <li key={id} className="rounded-full bg-surface-2 px-3 py-2 text-sm text-fg">
                  {methodLabel(t, id)}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.depositMethodsNote}</p>
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.depositNote}</p>
          {live.error ? (
            <p role="alert" className="text-sm text-down">
              {live.error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full"
              disabled={!ready}
              loading={launching === "koywe"}
              onClick={() => void openProvider("koywe")}
            >
              {t.wallet.depositContinue}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={!ready}
              loading={launching === "onramper"}
              onClick={() => void openProvider("onramper")}
            >
              {t.wallet.depositOther}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-fg-muted">{t.wallet.noWallet}</p>
      )}
      {widget ? (
        <MockWidget
          key={widget.session.id}
          session={widget.session}
          amountClp={widget.amountClp}
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          onSettled={setSpent}
        />
      ) : null}
    </Card>
  );
}

function Estimate({
  label,
  feeLabel,
  quoting,
  error,
  usdc,
  fee,
}: {
  label: string;
  feeLabel: string;
  quoting: string | null;
  error: string | null;
  usdc: string | null;
  fee: string | null;
}) {
  const value = quoting ? quoting : error ? "—" : (usdc ?? "—");
  const cost = quoting || error ? "—" : (fee ?? "—");
  return (
    <dl className="flex flex-col gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-fg-muted">{label}</dt>
        <dd className="num text-fg">{value}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-fg-muted">{feeLabel}</dt>
        <dd className="num text-fg">{cost}</dd>
      </div>
    </dl>
  );
}
