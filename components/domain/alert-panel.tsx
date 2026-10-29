"use client";

import { useState } from "react";
import Link from "next/link";

import { deletePriceAlert, formatAlertMoney, usePriceAlerts, useRefreshPriceAlerts } from "@/components/domain/alert-client";
import { InfoTip } from "@/components/domain/info-tip";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { alertasText, fillAlert, type AlertasMessages } from "@/content/i18n/extra-alertas";
import { ApiError } from "@/lib/api/client";
import { ingresarPath } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/session-context";
import { ACTIVE_ALERT_CAP } from "@/lib/services/alerts-logic";
import { useT } from "@/lib/hooks/use-t";

const ROW = "h-14 w-full rounded-2xl";

/** Lista de avisos de la cuenta. Sin sesión, un aviso corto. Borrar pide confirmación. */
export function AlertsPanel() {
  const { language } = useT();
  const copy = alertasText(language);
  const session = useSession();

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="avisos-precio">
      <div className="flex items-center justify-between gap-2">
        <h2 id="avisos-precio" className="min-w-0 text-lg font-semibold tracking-tight text-fg">
          {copy.alertsTitle}
        </h2>
        <InfoTip label={`${copy.alertsTitle}. ${copy.disclaimer}`} text={copy.alertsLead} />
      </div>
      {session.status === "loading" ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-36 w-full rounded-2xl sm:h-20" />
        </div>
      ) : null}
      {session.status === "unauthenticated" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-fg">{copy.signInTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{copy.signInBody}</p>
          </div>
          <Button asChild size="lg" className="min-h-11 w-full shrink-0 whitespace-nowrap sm:w-auto">
            <Link href={ingresarPath("/app/favoritas")}>{copy.signInAction}</Link>
          </Button>
        </div>
      ) : null}
      {session.status === "authenticated" ? <AlertsList copy={copy} /> : null}
    </section>
  );
}

function alertErrorText(error: unknown, copy: AlertasMessages): string {
  if (error instanceof ApiError) {
    if (error.code === "RATE_LIMITED") return copy.rateLimited;
    if (error.code === "NOT_FOUND") return copy.missing;
  }
  return copy.loadError;
}

function AlertsList({ copy }: { copy: AlertasMessages }) {
  const alerts = usePriceAlerts(true);
  const refresh = useRefreshPriceAlerts();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await deletePriceAlert(id);
      await refresh();
      toast({ title: copy.deleted, tone: "neutral" });
      setConfirmId(null);
    } catch (caught) {
      setError(alertErrorText(caught, copy));
    } finally {
      setPendingId(null);
    }
  }

  if (alerts.isPending) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-5 w-36" />
        <Skeleton className={ROW} />
        <Skeleton className={ROW} />
      </div>
    );
  }

  if (alerts.isError) {
    return (
      <ErrorState
        title={copy.loadError}
        onRetry={() => void alerts.refetch()}
        retryLabel={copy.retry}
        label={copy.loadError}
      />
    );
  }

  const rows = alerts.data?.alerts ?? [];
  const activeCount = rows.filter((alert) => alert.active && alert.triggeredAt == null).length;
  const confirmRow = rows.find((alert) => alert.id === confirmId) ?? null;
  const confirmSentence = confirmRow
    ? fillAlert(confirmRow.direction === "above" ? copy.rowAbove : copy.rowBelow, {
        symbol: confirmRow.symbol,
        price: formatAlertMoney(confirmRow.priceUsd),
      })
    : "";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-fg-muted tabular-nums">
        {fillAlert(copy.capCount, { count: activeCount, max: ACTIVE_ALERT_CAP })}
      </p>
      {alerts.data?.storage === "memory" ? <p className="text-sm text-fg-muted">{copy.memoryNote}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? <p className="text-sm text-fg-muted">{copy.alertsEmpty}</p> : null}
      {rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1.5">
          {rows.map((alert) => {
            const price = formatAlertMoney(alert.priceUsd);
            const sentence = fillAlert(alert.direction === "above" ? copy.rowAbove : copy.rowBelow, {
              symbol: alert.symbol,
              price,
            });
            return (
              <li
                key={alert.id}
                className="flex h-14 min-w-0 items-center gap-2 rounded-2xl border border-border/70 px-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/accion/${encodeURIComponent(alert.symbol)}`}
                    title={sentence}
                    className="block truncate text-sm font-medium text-fg outline-none hover:underline focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {sentence}
                  </Link>
                  <p className="truncate text-xs text-fg-muted">
                    {alert.triggeredAt ? copy.statusTriggered : copy.statusActive}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0 whitespace-nowrap px-3"
                  onClick={() => setConfirmId(alert.id)}
                >
                  {copy.delete}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Dialog
        open={confirmRow !== null}
        onOpenChange={(open) => {
          if (!open && pendingId === null) setConfirmId(null);
        }}
        title={copy.confirmTitle}
        description={confirmRow ? `${confirmSentence} ${fillAlert(copy.confirmBody, { symbol: confirmRow.symbol })}` : undefined}
      >
        {error ? (
          <p role="alert" className="mb-3 text-sm text-down">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="min-h-11 w-full whitespace-nowrap sm:w-auto"
            disabled={pendingId !== null}
            onClick={() => setConfirmId(null)}
          >
            {copy.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            className="min-h-11 w-full whitespace-nowrap sm:w-auto"
            disabled={pendingId !== null || confirmRow === null}
            loading={pendingId !== null}
            onClick={() => {
              if (confirmRow) void remove(confirmRow.id);
            }}
          >
            {pendingId !== null ? copy.deleting : copy.delete}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
