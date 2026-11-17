"use client";

import { useEffect } from "react";
import Link from "next/link";

import { PAGE_QUICK_LINKS, PageLinkCards } from "@/components/landing/page-link-cards";
import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Error de segmento de la landing: mantiene el header y el pie públicos.
 * No muestra el mensaje técnico; ofrece reintentar o volver a la portada, y
 * tres accesos directos a páginas que ya están en la navegación.
 */
export default function MarketingError({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section aria-labelledby="error-title" className="px-5 py-16 sm:py-24 md:py-28">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <p className="label">Error</p>
        <h1 id="error-title" className="text-title mt-4 text-balance">
          No pudimos cargar esta página
        </h1>
        <p className="mt-5 max-w-[46ch] text-lead text-pretty text-fg-body">
          Puede ser un problema momentáneo. Reintenta; si sigue igual, vuelve al inicio.
        </p>
        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={() => reset()}>Reintentar</Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Volver al inicio
          </Link>
        </div>
        <nav aria-label="Accesos directos" className="mt-14 w-full text-left">
          <p className="label mb-4 text-center">O ve directo a</p>
          <PageLinkCards links={PAGE_QUICK_LINKS} />
        </nav>
      </div>
    </section>
  );
}
