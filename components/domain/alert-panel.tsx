"use client";

import { useState } from "react";
import Link from "next/link";

import { deletePriceAlert, formatAlertMoney, usePriceAlerts, useRefreshPriceAlerts } from "@/components/domain/alert-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { alertasText, fillAlert, type AlertasMessages } from "@/content/i18n/extra-alertas";
import { ApiError } from "@/lib/api/client";
import { ingresarPath } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/session-context";
import { useT } from "@/lib/hooks/use-t";

/** Lista de avisos de la cuenta, con borrar. Sin sesión, invita a ingresar. */
export function AlertsPanel() {
  const { language } = useT();
  const copy = alertasText(language);
  const session = useSession();

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="avisos-precio">
      <div>
        <h2 id="avisos-precio" className="text-lg font-semibold tracking-tight text-fg">
          {copy.alertsTitle}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{copy.alertsLead}</p>
      </div>
      {session.status === "loading" ? <Skeleton className="h-24 w-full rounded-3xl" /> : null}
      {session.status === "unauthenticated" ? (
        <EmptyState
          title={copy.signInTitle}
          description={copy.signInBody}
          action={
            <Button asChild size="lg">
              <Link href={ingresarPath("/app/favoritas")}>{copy.signInAction}</Link>
            </Button>
          }
        />
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
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setPendingId(id);
    setError(null);
    try {
      await deletePriceAlert(id);
      await refresh();
      toast({ title: copy.deleted, tone: "neutral" });
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
        <Skeleton className="min-h-14 w-full rounded-2xl" />
        <Skeleton className="min-h-14 w-full rounded-2xl" />
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

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {alerts.data?.storage === "memory" ? <p className="text-sm text-fg-muted">{copy.memoryNote}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? <EmptyState title={copy.alertsEmpty} description={copy.disclaimer} /> : null}
      {rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1.5">
          {rows.map((alert) => {
            const price = formatAlertMoney(alert.priceUsd);
            const sentence = fillAlert(alert.direction === "above" ? copy.rowAbove : copy.rowBelow, {
              symbol: alert.symbol,
              price,
            });
            const busy = pendingId === alert.id;
            return (
              <li
                key={alert.id}
                className="flex min-h-14 flex-col gap-2 rounded-2xl border border-border/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/app/accion/${encodeURIComponent(alert.symbol)}`}
                    className="text-sm font-medium text-fg outline-none hover:underline focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {sentence}
                  </Link>
                  <p className="mt-0.5 text-xs text-fg-muted">{alert.triggeredAt ? copy.statusTriggered : copy.statusActive}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0"
                  disabled={busy}
                  onClick={() => void remove(alert.id)}
                >
                  {busy ? copy.deleting : copy.delete}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
