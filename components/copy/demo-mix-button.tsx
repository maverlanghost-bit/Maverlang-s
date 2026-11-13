"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/format";

/** Una pierna comprada o saltada, tal como la devuelve `/api/copy/demo-mix`. */
type MixResultItem = { symbol: string; usd: number; reason?: string };

type DemoMixView = {
  bought: MixResultItem[];
  skipped: MixResultItem[];
  boughtCount: number;
  skippedCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * La ruta devuelve `{ bought: n, skipped: m, legs: [{symbol, usd, status, error}] }`.
 * Se tolera que lleguen arreglos ya separados: en ambos casos queda la lista
 * de compradas y saltadas para mostrar el detalle.
 */
function resultOf(data: Record<string, unknown>): DemoMixView {
  const bought: MixResultItem[] = [];
  const skipped: MixResultItem[] = [];
  const legs = Array.isArray(data.legs) ? data.legs : [];
  for (const entry of legs) {
    const record = asRecord(entry);
    const symbol = record ? asString(record.symbol) : null;
    if (!record || !symbol) continue;
    const item: MixResultItem = {
      symbol,
      usd: asNumber(record.usd) ?? 0,
      reason: asString(record.error) ?? asString(record.reason) ?? undefined,
    };
    if (record.status === "bought") bought.push(item);
    else if (record.status === "skipped") skipped.push(item);
  }
  return {
    bought,
    skipped,
    boughtCount: asNumber(data.bought) ?? bought.length,
    skippedCount: asNumber(data.skipped) ?? skipped.length,
  };
}

/**
 * Compra de la mezcla en la cuenta DEMO: un solo clic.
 * El servidor ejecuta las piernas en serie con el motor demo, sin firma.
 * El plan firmado (`planId`) es lo único que viaja: nunca pesos del cliente.
 */
export function DemoMixButton({
  planId,
  totalUsd,
  onReset,
}: {
  planId: string;
  totalUsd: number;
  /** Tras un error no se reintenta el mismo plan: se arma uno nuevo. */
  onReset?: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoMixView | null>(null);

  async function buy() {
    if (pending || result) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/copy/demo-mix", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ planId }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const envelope = asRecord(payload);
      if (!response.ok || !envelope || envelope.ok !== true) {
        const failure = envelope ? asRecord(envelope.error) : null;
        throw new Error(asString(failure?.message) ?? "No pudimos comprar la mezcla.");
      }
      const data = asRecord(envelope.data) ?? envelope;
      const view = resultOf(data);
      if (view.boughtCount + view.skippedCount === 0) {
        throw new Error("La mezcla no compró ninguna orden. Inténtalo de nuevo.");
      }
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      setResult(view);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "No pudimos comprar la mezcla.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const bought = result.bought;
    const skipped = result.skipped;
    const spent = bought.reduce((sum, item) => sum + item.usd, 0);
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-surface-1 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium text-fg">
            {result.boughtCount > 0
              ? `Compramos ${result.boughtCount} ${result.boughtCount === 1 ? "orden" : "órdenes"} de la mezcla.`
              : "No se compró ninguna orden."}
          </p>
          <p className="text-sm text-fg-muted tabular-nums">
            Total comprado: {formatUsd(spent)}
            {result.skippedCount > 0 ? ` · Saltamos ${result.skippedCount}` : ""}
          </p>
        </div>
        {bought.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {bought.map((item) => (
              <li key={`b-${item.symbol}`} className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                <span className="font-medium text-fg">{item.symbol}</span>
                <span className="text-fg-muted">{formatUsd(item.usd)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {skipped.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Quedaron fuera</p>
            <ul className="flex flex-col gap-1.5">
              {skipped.map((item) => (
                <li key={`s-${item.symbol}`} className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium text-fg">{item.symbol}</span>
                  {item.reason ? <span className="text-xs leading-relaxed text-fg-muted">{item.reason}</span> : null}
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

  if (error) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-down/30 bg-down-bg/50 p-3">
        <p role="alert" className="text-sm leading-relaxed text-down">
          {error}
        </p>
        {onReset ? (
          <Button variant="secondary" size="lg" className="min-h-12 w-full touch-manipulation" onClick={onReset}>
            Armar la mezcla de nuevo
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        className="min-h-12 w-full touch-manipulation text-base"
        loading={pending}
        disabled={pending}
        onClick={() => void buy()}
      >
        {pending ? "Comprando la mezcla…" : "Comprar mezcla (demo)"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-fg-muted tabular-nums">
        Se ejecuta en la cuenta demo con saldo ficticio. Total: {formatUsd(totalUsd)}.
      </p>
    </div>
  );
}
