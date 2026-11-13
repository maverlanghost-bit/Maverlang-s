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
      <div role="status" aria-live="polite" className="flex flex-col gap-4 border-t border-border pt-5">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] leading-6 font-medium text-fg">
            {result.boughtCount > 0
              ? `Compramos ${result.boughtCount} ${result.boughtCount === 1 ? "orden" : "órdenes"} de la mezcla.`
              : "No se compró ninguna orden."}
          </p>
          <p className="num text-[13px] leading-5 text-fg-muted tabular-nums">
            Total comprado: {formatUsd(spent)}
            {result.skippedCount > 0 ? ` · Saltamos ${result.skippedCount}` : ""}
          </p>
        </div>
        {bought.length > 0 ? (
          <ul className="flex flex-col border-t border-border/70">
            {bought.map((item) => (
              <li
                key={`b-${item.symbol}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 truncate font-mono text-[15px] leading-5 font-medium text-fg">
                  {item.symbol}
                </span>
                <span className="num shrink-0 text-[13px] leading-5 tabular-nums text-fg-muted">
                  {formatUsd(item.usd)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {skipped.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="label-xs">Quedaron fuera</p>
            <ul className="flex flex-col border-t border-border/70">
              {skipped.map((item) => (
                <li key={`s-${item.symbol}`} className="flex flex-col gap-0.5 border-b border-border/70 py-2.5 last:border-b-0">
                  <span className="font-mono text-[15px] leading-5 font-medium text-fg">{item.symbol}</span>
                  {item.reason ? (
                    <span className="text-[13px] leading-relaxed text-fg-muted">{item.reason}</span>
                  ) : null}
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
      <div className="flex flex-col gap-3 border-l-2 border-down pl-3">
        <p role="alert" className="text-[13px] leading-relaxed text-down">
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
        className="min-h-12 w-full touch-manipulation text-[15px]"
        loading={pending}
        disabled={pending}
        onClick={() => void buy()}
      >
        {pending ? "Comprando la mezcla…" : "Comprar mezcla (demo)"}
      </Button>
      <p className="text-[13px] leading-relaxed text-fg-muted tabular-nums">
        Se ejecuta en la cuenta demo con saldo ficticio. Total: {formatUsd(totalUsd)}.
      </p>
    </div>
  );
}
