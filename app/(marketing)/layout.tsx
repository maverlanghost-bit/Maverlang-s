import type { ReactNode } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

// M48: sin `force-static`: la CSP con nonce exige render dinámico.

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg pt-16">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
