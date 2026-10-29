import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import mark from "@/app/icon.png";
import { AppShell } from "@/components/app-shell/app-shell";
import { PwaRegister } from "@/components/pwa/register";
import { PUBLIC_WORDMARK, PWA_THEME_COLOR } from "@/components/pwa/policy";
import { parseSidebarState, SIDEBAR_COOKIE } from "@/lib/app-shell/sidebar";
import { readAccountMode } from "@/lib/account/server";
import { readServerSession } from "@/lib/auth/server-session";
import { site } from "@/config/site";

export const viewport: Viewport = {
  themeColor: PWA_THEME_COLOR,
  colorScheme: "light",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  applicationName: site.name,
  appleWebApp: {
    capable: true,
    title: site.name,
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: mark.src, sizes: `${mark.width}x${mark.height}`, type: "image/png" }],
    apple: [
      { url: mark.src, sizes: `${mark.width}x${mark.height}`, type: "image/png" },
      { url: PUBLIC_WORDMARK.src, sizes: PUBLIC_WORDMARK.sizes, type: PUBLIC_WORDMARK.type },
    ],
  },
};

/** Ingresar y onboarding siguen bajo esta ruta, pero AppShell no les pone chrome. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await readServerSession();
  const jar = await cookies();
  const sidebarCollapsed = parseSidebarState(jar.get(SIDEBAR_COOKIE)?.value) === "collapsed";
  const accountMode = await readAccountMode();
  return (
    <AppShell signedIn={session.hasSession} sidebarCollapsed={sidebarCollapsed} accountMode={accountMode}>
      <PwaRegister />
      {children}
    </AppShell>
  );
}
