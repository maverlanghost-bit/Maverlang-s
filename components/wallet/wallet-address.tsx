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
          className="num flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md border border-border bg-bg px-3 text-[13px] leading-none text-fg sm:justify-start"
        >
          <span className="truncate" aria-hidden>
            {shortenAddress(address)}
          </span>
          <span className="sr-only">{address}</span>
        </p>
        <Button type="button" size="md" onClick={() => void copy()} aria-live="polite" className="w-full shrink-0 sm:w-auto">
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
    </div>
  );
}
