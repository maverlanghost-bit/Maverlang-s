"use client";

import Link from "next/link";
import { PAGE_QUICK_LINKS, PageLinkCards } from "@/components/landing/page-link-cards";
import { buttonClasses } from "@/components/ui/button";
import { useT } from "@/lib/hooks/use-t";

/**
 * 404 de marketing (T70): mensaje centrado, la acción de siempre y tres
 * accesos directos. Los textos vienen del mismo diccionario que `NotFoundView`
 * (así respeta el idioma elegido); el layout público ya trae `<main>`.
 */
export function PageNotFound() {
  const { t } = useT();

  return (
    <section aria-labelledby="not-found-title" className="px-5 py-16 sm:py-24 md:py-28">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <p className="label">{t.notFound.code}</p>
        <h1 id="not-found-title" className="text-title mt-4 text-balance">
          {t.notFound.pageTitle}
        </h1>
        <p className="mt-5 max-w-[46ch] text-lead text-pretty text-fg-body">{t.notFound.pageBody}</p>
        <Link
          href="/"
          className={buttonClasses({ variant: "primary", className: "mt-8 min-h-11 w-full sm:w-auto" })}
        >
          {t.notFound.pageAction}
        </Link>
        <nav aria-label="Accesos directos" className="mt-14 w-full text-left">
          <p className="label mb-4 text-center">O ve directo a</p>
          <PageLinkCards links={PAGE_QUICK_LINKS} />
        </nav>
      </div>
    </section>
  );
}
