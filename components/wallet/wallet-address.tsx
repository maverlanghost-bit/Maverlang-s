"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconCheck, IconCopy } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Dirección de cobro en una línea: se muestra recortada por el centro para que
 * se lean el inicio y el final (los extremos son lo que se compara al pegar),
 * el texto completo queda para el lector de pantalla y para `title`, y el
 * botón copia siempre la dirección íntegra.
 */
export function shortenAddress(address: string, head = 6, tail = 6): string {
  const value = address.trim();
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Mitades de la dirección recortada. Se pintan como dos piezas: si el ancho
 * aprieta, la primera se recorta y el final queda siempre visible.
 */
function addressParts(address: string, head = 6, tail = 6): { start: string; end: string } {
  const value = address.trim();
  if (value.length <= head + tail + 1) return { start: value, end: "" };
  return { start: value.slice(0, head), end: value.slice(-tail) };
}

export function WalletAddress({
  address,
  label,
  copyLabel,
  copiedLabel,
  className,
}: {
  address: string;
  label?: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const parts = addressParts(address);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      {label ? <p className="label">{label}</p> : null}
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
        <p
          title={address}
          className="num flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-bg px-3 text-[13px] leading-none text-fg sm:flex-1 sm:justify-start"
        >
          <span className="min-w-0 truncate" aria-hidden>
            {parts.start}
          </span>
          {parts.end ? (
            <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
              <span className="text-fg-muted">…</span>
              <span>{parts.end}</span>
            </span>
          ) : null}
          <span className="sr-only">{address}</span>
        </p>
        <Button type="button" size="md" onClick={() => void copy()} className="w-full shrink-0 sm:w-auto">
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      {/* El texto del botón ya cambia; esto lo anuncia aunque el foco esté lejos. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </div>
  );
}
