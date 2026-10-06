import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { readServerSession } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Ingresar y onboarding siguen bajo esta ruta, pero AppShell no les pone chrome. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await readServerSession();
  return <AppShell signedIn={session.hasSession}>{children}</AppShell>;
}
