import type { ReactNode } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

/** Landing, ayuda y legales no dependen de la sesión ni de la hora. */
export const dynamic = "force-static";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg pt-16">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
