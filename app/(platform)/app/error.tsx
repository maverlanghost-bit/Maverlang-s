"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Error de segmento de la plataforma: el layout con la barra lateral y las tabs
 * sigue visible. No muestra el mensaje técnico; reintentar es la acción
 * principal y volver al inicio queda como enlace de texto.
 */
export default function PlatformError({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-5 py-10 sm:py-14">
      <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
        Error
      </p>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">
          No pudimos cargar esta pantalla
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-pretty text-fg-muted">
          Puede ser un problema momentáneo. Reintenta; si sigue igual, vuelve al inicio y sigue desde ahí.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button onClick={() => reset()} className="min-h-11">
          Reintentar
        </Button>
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center text-[13px] font-medium text-fg-muted underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
