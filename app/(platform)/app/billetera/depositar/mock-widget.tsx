"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { Messages } from "@/content/i18n/es-CL";
import { ApiError, notifyOnrampWebhook } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatClp, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { OnrampProviderId, OnrampSession } from "@/lib/types";

type Step = "pay" | "processing" | "credited" | "error";

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

function providerName(t: Messages, id: OnrampProviderId) {
  return id === "onramper" ? t.wallet.providerOnramper : t.wallet.providerKoywe;
}

function failure(t: Messages, error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "QUOTE_EXPIRED") return t.wallet.depositExpired;
    if (error.code === "NOT_FOUND") return t.wallet.depositMissing;
    if (error.code === "VALIDATION") return t.wallet.depositInvalid;
    if (error.code === "UNAUTHORIZED") return t.trade.errors.UNAUTHORIZED;
  }
  return t.wallet.depositFailed;
}

export function MockWidget({
  session,
  amountClp,
  open,
  onOpenChange,
  onSettled,
}: {
  session: OnrampSession;
  amountClp: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled: (sessionId: string) => void;
}) {
  const { t } = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const paying = useRef(false);
  const [step, setStep] = useState<Step>("pay");
  const [error, setError] = useState<string | null>(null);
  const provider = providerName(t, session.provider);
  const usdc = formatUsd(session.estimatedUsdc);
  const steps = [
    { id: "pay" as const, label: t.wallet.depositStepPay },
    { id: "processing" as const, label: t.wallet.depositStepProcessing },
    { id: "credited" as const, label: t.wallet.depositStepDone },
  ];
  const current = step === "error" ? "processing" : step;

  async function pay() {
    if (paying.current) return;
    paying.current = true;
    setError(null);
    setStep("processing");
    try {
      const result = await notifyOnrampWebhook({ sessionId: session.id });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      onSettled(session.id);
      setStep("credited");
      const amount = formatUsd(result.estimatedUsdc ?? session.estimatedUsdc);
      toast({
        title: result.already ? t.wallet.depositAlready : t.wallet.depositToast,
        description: fill(t.wallet.depositToastBody, { amount }),
        tone: "up",
      });
    } catch (caught) {
      setError(failure(t, caught));
      setStep("error");
    } finally {
      paying.current = false;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={fill(t.wallet.depositWidget, { provider })}
      description={t.wallet.depositDemo}
    >
      <ol className="mt-5 flex gap-2">
        {steps.map((item) => {
          const active = item.id === current;
          return (
            <li
              key={item.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-full px-2 text-center text-sm",
                active ? "bg-surface-3 font-medium text-fg" : "bg-surface-2 text-fg-muted",
              )}
            >
              {item.label}
            </li>
          );
        })}
      </ol>

      <dl className="mt-5 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-fg-muted">{t.wallet.depositAmount}</dt>
          <dd className="num text-fg">{formatClp(amountClp)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-fg-muted">{t.wallet.depositEstimate}</dt>
          <dd className="num text-fg">{usdc}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-fg-muted">{t.wallet.depositFee}</dt>
          <dd className="num text-fg">{formatClp(session.feeClp)}</dd>
        </div>
      </dl>

      <div className="mt-5" aria-live="polite">
        {step === "pay" ? <p className="text-sm leading-relaxed text-fg-body">{t.wallet.depositPayLead}</p> : null}
        {step === "processing" ? <p className="text-sm text-fg">{t.wallet.depositProcessing}</p> : null}
        {step === "credited" ? (
          <div>
            <p className="font-medium text-fg">{t.wallet.depositCredited}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-body">{fill(t.wallet.depositCreditedBody, { amount: usdc })}</p>
          </div>
        ) : null}
        {step === "error" && error ? (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {step === "pay" || step === "error" ? (
          <Button size="lg" className="w-full" onClick={() => void pay()}>
            {step === "error" ? t.states.retry : t.wallet.depositPay}
          </Button>
        ) : null}
        {step === "processing" ? (
          <Button size="lg" className="w-full" loading disabled>
            {t.wallet.depositProcessing}
          </Button>
        ) : null}
        {step === "credited" ? (
          <Button asChild size="lg" className="w-full">
            <Link href="/app/billetera">{t.wallet.viewActivity}</Link>
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
