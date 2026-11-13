"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconCheck, IconCopy } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  label = "Copiar",
  copiedLabel = "Copiado",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={onClick}>
        {/* Icono en caja fija: check y portapapeles comparten hueco. */}
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <IconCheck
            className={cn("absolute transition-opacity duration-150", copied ? "opacity-100" : "opacity-0")}
          />
          <IconCopy
            className={cn("absolute transition-opacity duration-150", copied ? "opacity-0" : "opacity-100")}
          />
        </span>
        {/* Los dos rótulos ocupan la misma celda: el ancho no se mueve al copiar. */}
        <span className="grid text-left whitespace-nowrap">
          <span className={cn("col-start-1 row-start-1", copied && "invisible")}>{label}</span>
          <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>{copiedLabel}</span>
        </span>
      </Button>
      {/* Anuncio aparte: el botón conserva su nombre accesible y sigue midiendo igual. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
