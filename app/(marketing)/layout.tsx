import type { ReactNode } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { esCL } from "@/content/i18n/es-CL";

// M48: sin `force-static`: la CSP con nonce exige render dinámico.

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg pt-16">
      {/* M85: enlace "Saltar al contenido" (WCAG 2.4.1). La plataforma ya lo
          tiene en el AppShell; la landing no tenía forma de saltar el header. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        {esCL.shell.skip}
      </a>
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
