"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Error de segmento de la landing: mantiene el header y el pie públicos.
 * No muestra el mensaje técnico; ofrece reintentar o volver a la portada.
 */
export default function MarketingError({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section aria-labelledby="error-title" className="px-5 py-20 md:py-28">
      <div className="mx-auto w-full max-w-2xl">
        <p className="label">Error</p>
        <h1 id="error-title" className="mt-3 text-3xl sm:text-4xl">
          No pudimos cargar esta página
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
          Puede ser un problema momentáneo. Reintenta; si sigue igual, vuelve al inicio.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={() => reset()}>Reintentar</Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </section>
  );
}
