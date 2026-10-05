import type { ReactNode } from "react";
import { SiteHeader } from "@/components/landing/site-header";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg pt-16">
      <SiteHeader />
      {children}
    </div>
  );
}
