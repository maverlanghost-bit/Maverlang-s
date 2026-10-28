"use client";

import { useState } from "react";
import Link from "next/link";

import { createPriceAlert, formatAlertMoney, usePriceAlerts, useRefreshPriceAlerts } from "@/components/domain/alert-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { alertasText, fillAlert, type AlertasMessages } from "@/content/i18n/extra-alertas";
import { ApiError } from "@/lib/api/client";
import { ingresarPath } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/session-context";
import { ACTIVE_ALERT_CAP, parseAlertPriceInput, type AlertDirection } from "@/lib/services/alerts-logic";
import { useT } from "@/lib/hooks/use-t";

/**
 * Botón "Avísame si sube de / baja de". Para montarlo en la ficha, al lado
 * del favorito: `<AlertButton symbol={ticker.symbol} name={ticker.name} priceUsd={quote?.priceUsd ?? null} />`.
 */
export function AlertButton({
  symbol,
  name,
  priceUsd = null,
}: {
  symbol: string;
  name: string;
  priceUsd?: number | null;
}) {
  const { language } = useT();
  const copy = alertasText(language);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="min-h-11 px-3"
        aria-label={fillAlert(copy.alertActionLabel, { name })}
        onClick={() => setOpen(true)}
      >
        {copy.alertAction}
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
          <Link href={ingresarPath("/app/favoritas")}>{copy.signInAction}</Link>
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
      className="mt-4 flex flex-col gap-4"
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
        <Input
          inputMode="decimal"
          autoComplete="off"
          name="priceUsd"
          value={rawPrice}
          placeholder="0.00"
          aria-invalid={rawPrice.trim().length > 0 && parsed == null}
          onChange={(event) => setRawPrice(event.target.value)}
        />
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
