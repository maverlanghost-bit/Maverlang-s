import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { parseSidebarState, SIDEBAR_COOKIE } from "@/lib/app-shell/sidebar";
import { readAccountMode } from "@/lib/account/server";
import { readServerSession } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Ingresar y onboarding siguen bajo esta ruta, pero AppShell no les pone chrome. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await readServerSession();
  const jar = await cookies();
  const sidebarCollapsed = parseSidebarState(jar.get(SIDEBAR_COOKIE)?.value) === "collapsed";
  const accountMode = await readAccountMode();
  return (
    <AppShell signedIn={session.hasSession} sidebarCollapsed={sidebarCollapsed} accountMode={accountMode}>
      {children}
    </AppShell>
  );
}
