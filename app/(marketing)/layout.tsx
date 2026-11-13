import type { ReactNode } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { esCL } from "@/content/i18n/es-CL";

// M48: sin `force-static`: la CSP con nonce exige render dinámico.

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg pt-16">
      {/* M85: enlace "Saltar al contenido" (WCAG 2.4.1). La plataforma ya lo
          tiene en el AppShell; la landing no tenía forma de saltar el header.
          Visible mide 44px (target táctil) y usa el negro de `fg` (21:1). */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-fg focus:px-4 focus:text-sm focus:text-bg"
      >
        {esCL.shell.skip}
      </a>
      <SiteHeader />
      {/* D1: `flex-1` pega el pie al borde inferior en 404/error, que son cortas;
          en el resto no cambia nada porque el contenido desborda la ventana. */}
      <main id="contenido" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
