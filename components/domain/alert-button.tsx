"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { createPriceAlert, formatAlertMoney, usePriceAlerts, useRefreshPriceAlerts } from "@/components/domain/alert-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { alertasText, fillAlert, type AlertasMessages } from "@/content/i18n/extra-alertas";
import { carteraCopy } from "@/content/i18n/extra-cartera";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/client";
import { ingresarPath } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/session-context";
import { ACTIVE_ALERT_CAP, parseAlertPriceInput, type AlertDirection } from "@/lib/services/alerts-logic";
import { useT } from "@/lib/hooks/use-t";

function IconBell() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden>
      <path
        d="M8 2.4a3.1 3.1 0 0 0-3.1 3.1c0 2.05-.62 2.62-1.02 3.02-.22.22-.38.48-.38.78 0 .39.32.7.7.7h7.6c.38 0 .7-.31.7-.7 0-.3-.16-.56-.38-.78-.4-.4-1.02-.97-1.02-3.02A3.1 3.1 0 0 0 8 2.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.7 12.05a1.3 1.3 0 0 0 2.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * En la ficha (`labeled`) dice "Crear alerta de precio".
 * En una fila de favoritas queda el texto corto, para no aplastar el nombre.
 */
export function AlertButton({
  symbol,
  name,
  priceUsd = null,
  labeled = false,
}: {
  symbol: string;
  name: string;
  priceUsd?: number | null;
  labeled?: boolean;
}) {
  const { t, language } = useT();
  const copy = alertasText(language);
  const detail = carteraCopy(language);
  const session = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const signedIn = session.status === "authenticated";
  const buttonClass = "h-11 gap-1.5 px-3";

  if (labeled && session.status === "loading") {
    return (
      <span role="status" className="inline-flex">
        <span className="sr-only">{t.states.loading}</span>
        <Skeleton className="h-11 w-52 rounded-full" />
      </span>
    );
  }

  if (labeled && !signedIn) {
    return (
      <Button asChild variant="secondary" size="sm" className={cn(buttonClass, "whitespace-nowrap")}>
        <Link href={ingresarPath(pathname)}>
          <IconBell />
          {detail.alertSignIn}
        </Link>
      </Button>
    );
  }

  const visible = labeled ? detail.alertCreate : copy.alertAction;
  const label = labeled ? fillAlert(detail.alertCreateLabel, { name }) : fillAlert(copy.alertActionLabel, { name });

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={cn(buttonClass, labeled && "whitespace-nowrap")}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <IconBell />
        {visible}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={copy.dialogTitle} description={fillAlert(copy.dialogBody, { name })}>
        <AlertForm symbol={symbol} name={name} priceUsd={priceUsd} copy={copy} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function alertErrorText(error: unknown, copy: AlertasMessages): string {
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHORIZED") return copy.signInBody;
    if (error.code === "RATE_LIMITED") return copy.rateLimited;
    if (error.code === "NOT_FOUND") return copy.missing;
    if (error.code === "VALIDATION" && error.message.includes("20")) return copy.cap;
  }
  return copy.unavailable;
}

function AlertForm({
  symbol,
  name,
  priceUsd,
  copy,
  onDone,
}: {
  symbol: string;
  name: string;
  priceUsd: number | null;
  copy: AlertasMessages;
  onDone: () => void;
}) {
  const session = useSession();
  const pathname = usePathname();
  const { toast } = useToast();
  const signedIn = session.status === "authenticated";
  const alerts = usePriceAlerts(signedIn);
  const refresh = useRefreshPriceAlerts();
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [rawPrice, setRawPrice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseAlertPriceInput(rawPrice);
  const activeCount = (alerts.data?.alerts ?? []).filter((alert) => alert.active && alert.triggeredAt == null).length;
  const atCap = activeCount >= ACTIVE_ALERT_CAP;

  if (session.status === "loading") {
    return <p className="mt-4 text-sm text-fg-muted">{copy.loading}</p>;
  }

  if (!signedIn) {
    return (
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-fg-muted">{copy.signInBody}</p>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href={ingresarPath(pathname)}>{copy.signInAction}</Link>
        </Button>
      </div>
    );
  }

  async function save() {
    if (parsed == null || pending || atCap) return;
    setPending(true);
    setError(null);
    try {
      await createPriceAlert({ symbol, direction, priceUsd: parsed });
      await refresh();
      toast({ title: copy.saved, tone: "neutral" });
      onDone();
    } catch (caught) {
      setError(alertErrorText(caught, copy));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-fg-muted">
        {priceUsd != null && priceUsd > 0 ? fillAlert(copy.priceHint, { price: formatAlertMoney(priceUsd) }) : copy.priceMissing}
      </p>
      <SegmentedControl
        label={copy.directionLabel}
        value={direction}
        fullWidth
        compact
        onChange={(value) => {
          if (value === "above" || value === "below") setDirection(value);
        }}
        options={[
          { value: "above", label: copy.above },
          { value: "below", label: copy.below },
        ]}
      />
      <label className="flex flex-col gap-1.5 text-sm text-fg">
        {copy.priceLabel}
        <span className="relative block">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-fg-muted" aria-hidden>
            US$
          </span>
          <Input
            inputMode="decimal"
            autoComplete="off"
            name="priceUsd"
            value={rawPrice}
            placeholder="0,00"
            aria-invalid={rawPrice.trim().length > 0 && parsed == null}
            className="pl-12 tabular-nums"
            onChange={(event) => setRawPrice(event.target.value)}
          />
        </span>
      </label>
      {atCap ? <p className="text-sm text-fg-muted">{copy.cap}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" className="w-full sm:w-auto" onClick={onDone}>
          {copy.cancel}
        </Button>
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending || parsed == null || atCap} loading={pending}>
          {pending ? copy.saving : copy.save}
        </Button>
      </div>
      <p className="sr-only">{name}</p>
    </form>
  );
}
