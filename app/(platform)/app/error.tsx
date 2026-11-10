"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Error de segmento de la plataforma: el layout con la barra lateral y las tabs
 * sigue visible. No muestra el mensaje técnico; ofrece reintentar o salir.
 */
export default function PlatformError({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-4 py-8">
      <p className="label">Error</p>
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        No pudimos cargar esta pantalla
      </h1>
      <p className="text-sm leading-relaxed text-fg-muted">
        Puede ser un problema momentáneo. Reintenta; si sigue igual, vuelve al inicio y sigue desde ahí.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button onClick={() => reset()}>Reintentar</Button>
        <Link href="/app" className={buttonClasses({ variant: "secondary" })}>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
