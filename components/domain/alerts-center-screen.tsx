"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

import {
  createPriceAlert,
  deletePriceAlert,
  formatAlertMoney,
  usePriceAlerts,
  useRefreshPriceAlerts,
  type PriceAlertDto,
} from "@/components/domain/alert-client";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { AssetPicker } from "@/components/domain/asset-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { alertasText, fillAlert } from "@/content/i18n/extra-alertas";
import { ApiError } from "@/lib/api/client";
import { ingresarPath } from "@/lib/auth/paths";
import { useSession } from "@/lib/auth/session-context";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { ACTIVE_ALERT_CAP } from "@/lib/services/alerts-logic";

type SelectedAsset = {
  symbol: string;
  name: string;
  logoUrl: string | null;
};

const QUICK_ASSETS: readonly SelectedAsset[] = [
  { symbol: "AAPLx", name: "Apple", logoUrl: null },
  { symbol: "NVDAx", name: "NVIDIA", logoUrl: null },
  { symbol: "TSLAx", name: "Tesla", logoUrl: null },
  { symbol: "SPYx", name: "SPDR S&P 500", logoUrl: null },
];

const TARGET_PCT_PRESETS = [-10, -5, -2, 2, 5, 10] as const;

function createErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "RATE_LIMITED") return "Demasiadas solicitudes. Espera un momento antes de intentar de nuevo.";
    if (error.code === "UNAUTHORIZED") return "Inicia sesión para crear alertas de precio.";
    return error.message;
  }
  return "No pudimos guardar la alerta. Intenta nuevamente.";
}

export function AlertsCenterScreen({ sections }: { sections?: ReactNode }) {
  const session = useSession();
  const { language } = useT();
  const copy = alertasText(language);
  const { toast } = useToast();
  const refreshAlerts = useRefreshPriceAlerts();

  const [selected, setSelected] = useState<SelectedAsset>(QUICK_ASSETS[0]);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [targetPriceInput, setTargetPriceInput] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmRow, setConfirmRow] = useState<PriceAlertDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const isAuthenticated = session.status === "authenticated";
  const alertsQuery = usePriceAlerts(isAuthenticated);
  const alertRows = alertsQuery.data?.alerts ?? [];

  const symbolsToPrice: string[] = [selected.symbol];
  for (const row of alertRows) {
    if (!symbolsToPrice.includes(row.symbol)) symbolsToPrice.push(row.symbol);
  }
  const pricesQuery = usePrices(symbolsToPrice, symbolsToPrice.length > 0);

  const spotBySymbol = new Map<string, number>();
  for (const quote of pricesQuery.data ?? []) {
    spotBySymbol.set(quote.symbol, quote.priceUsd);
  }
  const selectedSpot = spotBySymbol.get(selected.symbol) ?? null;

  function selectAsset(asset: SelectedAsset) {
    setSelected(asset);
    setFormError(null);
    setTargetPriceInput("");
  }

  function applyQuickPct(pct: number) {
    if (selectedSpot === null || selectedSpot <= 0) return;
    const computed = Number((selectedSpot * (1 + pct / 100)).toFixed(selectedSpot >= 10 ? 2 : 4));
    setTargetPriceInput(String(computed));
    setDirection(pct >= 0 ? "above" : "below");
    setFormError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated || submitting) return;

    const priceUsd = Number(targetPriceInput);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      setFormError("Ingresa un precio objetivo válido en USD.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createPriceAlert({
        symbol: selected.symbol,
        direction,
        priceUsd,
      });
      await refreshAlerts();
      toast({
        title: "Alerta creada",
        description: `${selected.symbol} ${direction === "above" ? "sobre" : "bajo"} ${formatAlertMoney(priceUsd)}`,
        tone: "up",
      });
      setTargetPriceInput("");
    } catch (caught) {
      setFormError(createErrorText(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setListError(null);
    try {
      await deletePriceAlert(id);
      await refreshAlerts();
      toast({ title: copy.deleted, tone: "neutral" });
      setConfirmRow(null);
    } catch (caught) {
      setListError(createErrorText(caught));
    } finally {
      setDeletingId(null);
    }
  }

  const activeCount = alertRows.filter((alert) => alert.active && alert.triggeredAt == null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alertas de precio"
        description="Define precios objetivo para cualquier acción del mercado y revisa la distancia porcentual al precio actual."
      />

      {sections}

      {/* Creador Rápido de Alertas */}
      <section
        aria-labelledby="quick-alert-heading"
        className="flex flex-col gap-5 rounded-3xl border border-border bg-bg p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="quick-alert-heading" className="text-base font-medium text-fg">
              Creador rápido de alertas
            </h2>
            <p className="text-xs text-fg-muted">
              Busca un activo, elige si sube o baja y define tu precio objetivo en USD.
            </p>
          </div>
          {isAuthenticated ? (
            <Badge tone="neutral" className="tabular-nums">
              {activeCount} / {ACTIVE_ALERT_CAP} activas
            </Badge>
          ) : null}
        </div>

        {/* Buscador de activo + chips rápidos */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_ASSETS.map((asset) => {
              const active = selected.symbol === asset.symbol;
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  onClick={() => selectAsset(asset)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    active
                      ? "border-fg bg-fg text-white"
                      : "border-border bg-bg text-fg hover:bg-surface-1",
                  )}
                >
                  {asset.symbol}
                </button>
              );
            })}
          </div>

          <div>
            <AssetPicker
              mode="single"
              includeCrypto={false}
              tradableOnly
              selectedSymbols={[selected.symbol]}
              label="Buscar acción para crear alerta"
              onSelect={(asset) => selectAsset({ symbol: asset.symbol, name: asset.name, logoUrl: asset.logoUrl ?? null })}
            />
          </div>
        </div>

        {/* Activo seleccionado y precio actual */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-1 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <TickerLogo
              symbol={selected.symbol}
              name={selected.name}
              logoUrl={selected.logoUrl}
              size={36}
              decorative
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{selected.symbol}</p>
              <p className="truncate text-xs text-fg-muted">{selected.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-fg-muted">Precio actual</p>
            <p className="text-base font-semibold text-fg tabular-nums">
              {selectedSpot !== null ? formatAlertMoney(selectedSpot) : "Cargando…"}
            </p>
          </div>
        </div>

        {session.status === "unauthenticated" ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-fg">{copy.signInTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{copy.signInBody}</p>
            </div>
            <Button asChild size="lg" className="min-h-12 w-full shrink-0 whitespace-nowrap sm:w-auto">
              <Link href={ingresarPath("/app/alertas")}>{copy.signInAction}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleCreate(event)} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-fg-muted">Condición</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection("above")}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 text-sm font-medium transition-colors",
                      direction === "above"
                        ? "border-fg bg-fg text-white"
                        : "border-border bg-bg text-fg hover:bg-surface-1",
                    )}
                  >
                    Sube sobre
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection("below")}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 text-sm font-medium transition-colors",
                      direction === "below"
                        ? "border-fg bg-fg text-white"
                        : "border-border bg-bg text-fg hover:bg-surface-1",
                    )}
                  >
                    Baja de
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="alert-target-usd" className="text-xs font-medium text-fg-muted">
                  Precio objetivo (USD)
                </label>
                <Input
                  id="alert-target-usd"
                  type="number"
                  min={0.01}
                  step="any"
                  value={targetPriceInput}
                  onChange={(event) => {
                    setTargetPriceInput(event.target.value);
                    setFormError(null);
                  }}
                  placeholder={selectedSpot !== null ? String(selectedSpot) : "Ej. 240.00"}
                  className="tabular-nums"
                />
              </div>
            </div>

            {/* Botones rápidos de porcentaje */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-muted">Atajos desde el precio actual:</span>
              {TARGET_PCT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={selectedSpot === null}
                  onClick={() => applyQuickPct(pct)}
                  className={cn(
                    "min-h-9 rounded-full border border-border bg-bg px-3 text-xs font-medium tabular-nums transition-colors hover:bg-surface-1 disabled:opacity-40",
                    pct >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {pct > 0 ? `+${pct}%` : `${pct}%`}
                </button>
              ))}
            </div>

            {formError ? (
              <p role="alert" className="text-sm text-down">
                {formError}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                size="lg"
                loading={submitting}
                disabled={submitting || session.status !== "authenticated"}
                className="w-full sm:w-auto"
              >
                <BellIcon className="size-4" />
                Crear alerta
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* Lista centralizada de alertas */}
      {isAuthenticated ? (
        <section className="flex flex-col gap-3" aria-labelledby="alerts-list-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="alerts-list-heading" className="text-lg font-medium tracking-tight text-fg">
              Tus alertas ({alertRows.length})
            </h2>
            <span className="text-xs text-fg-muted tabular-nums">
              {fillAlert(copy.capCount, { count: activeCount, max: ACTIVE_ALERT_CAP })}
            </span>
          </div>

          {listError ? (
            <p role="alert" className="text-sm text-down">
              {listError}
            </p>
          ) : null}

          {alertsQuery.isPending ? (
            <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : alertsQuery.isError ? (
            <ErrorState
              title={copy.loadError}
              onRetry={() => void alertsQuery.refetch()}
              retryLabel={copy.retry}
              label={copy.loadError}
            />
          ) : alertRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">
              {copy.alertsEmpty}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {alertRows.map((alert) => {
                const spot = spotBySymbol.get(alert.symbol) ?? null;
                const distanceRatio = spot !== null && spot > 0 ? (alert.priceUsd - spot) / spot : null;
                const sentence = fillAlert(alert.direction === "above" ? copy.rowAbove : copy.rowBelow, {
                  symbol: alert.symbol,
                  price: formatAlertMoney(alert.priceUsd),
                });

                return (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/accion/${encodeURIComponent(alert.symbol)}`}
                          className="truncate text-sm font-medium text-fg hover:underline"
                        >
                          {sentence}
                        </Link>
                        <Badge tone={alert.triggeredAt ? "neutral" : "up"}>
                          {alert.triggeredAt ? copy.statusTriggered : copy.statusActive}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-fg-muted tabular-nums">
                        {spot !== null ? (
                          <>
                            Spot actual: {formatAlertMoney(spot)}
                            {distanceRatio !== null ? (
                              <>
                                {" · "}
                                Distancia:{" "}
                                <span className={distanceRatio >= 0 ? "text-up" : "text-down"}>
                                  {formatPercent(distanceRatio)}
                                </span>
                              </>
                            ) : null}
                          </>
                        ) : (
                          "Consultando precio spot…"
                        )}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRow(alert)}
                      className="shrink-0"
                    >
                      {copy.delete}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <Dialog
            open={confirmRow !== null}
            onOpenChange={(open) => {
              if (!open && deletingId === null) setConfirmRow(null);
            }}
            title={copy.confirmTitle}
            description={
              confirmRow
                ? `${fillAlert(confirmRow.direction === "above" ? copy.rowAbove : copy.rowBelow, {
                    symbol: confirmRow.symbol,
                    price: formatAlertMoney(confirmRow.priceUsd),
                  })} ${fillAlert(copy.confirmBody, { symbol: confirmRow.symbol })}`
                : undefined
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={deletingId !== null}
                onClick={() => setConfirmRow(null)}
              >
                {copy.cancel}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="lg"
                disabled={deletingId !== null || confirmRow === null}
                loading={deletingId !== null}
                onClick={() => {
                  if (confirmRow) void handleDelete(confirmRow.id);
                }}
              >
                {deletingId !== null ? copy.deleting : copy.delete}
              </Button>
            </div>
          </Dialog>
        </section>
      ) : null}
    </div>
  );
}
